import path from 'node:path';
import { existsSync } from 'node:fs';
import express from 'express';
import type { ErrorRequestHandler, NextFunction, Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import QRCode from 'qrcode';
import { z } from 'zod';
import {
  maskIdNumber,
  maskPhone,
  registrationSchema,
} from '../shared/validation.js';
import type { AppConfig } from './config.js';
import { registrationsToCsv } from './csv.js';
import { FixedWindowLimiter, LoginFailureLimiter } from './rate-limit.js';
import {
  createSessionToken,
  hashSessionToken,
  stableDigest,
  verifyPassword,
} from './security.js';
import { PhoneMismatchError, RegistrationStore } from './store.js';

const SESSION_COOKIE = 'registration_admin_session';
const SESSION_TTL_MS = 30 * 60_000;

const adminLoginSchema = z.object({
  username: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(200),
});

type SessionEntry = { expiresAt: number };

function errorResponse(response: Response, status: number, error: string, code?: string) {
  return response.status(status).json({ error, ...(code ? { code } : {}) });
}

export function createApp(config: AppConfig, store: RegistrationStore) {
  const app = express();
  const allowedOrigin = new URL(config.publicUrl).origin;
  const secureCookies = new URL(config.publicUrl).protocol === 'https:';
  const submitLimiter = new FixedWindowLimiter(300, 60_000);
  const identitySubmitLimiter = new FixedWindowLimiter(6, 10 * 60_000, 20_000);
  const loginAttemptLimiter = new FixedWindowLimiter(20, 15 * 60_000);
  const loginFailureLimiter = new LoginFailureLimiter();
  const sessions = new Map<string, SessionEntry>();
  let qrImagePromise: Promise<Buffer> | null = null;

  const getQrImage = () => {
    if (!qrImagePromise) {
      qrImagePromise = QRCode.toBuffer(config.publicUrl, {
        type: 'png',
        width: 1024,
        margin: 4,
        errorCorrectionLevel: 'H',
        color: { dark: '#075985', light: '#ffffff' },
      }).catch((error) => {
        qrImagePromise = null;
        throw error;
      });
    }
    return qrImagePromise;
  };

  const sweepSessions = (now = Date.now()) => {
    for (const [token, session] of sessions) {
      if (session.expiresAt <= now) sessions.delete(token);
    }
    while (sessions.size >= 1_000) {
      const oldestToken = sessions.keys().next().value as string | undefined;
      if (!oldestToken) break;
      sessions.delete(oldestToken);
    }
  };

  if (config.trustProxy !== false) app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');
  app.use(
    helmet({
      crossOriginEmbedderPolicy: false,
      strictTransportSecurity: secureCookies ? undefined : false,
      referrerPolicy: { policy: 'no-referrer' },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          fontSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: secureCookies ? [] : null,
        },
      },
    }),
  );
  app.use((_request, response, next) => {
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });
  app.use(cookieParser());
  app.use(express.json({ limit: '32kb', strict: true }));

  const requireSameOrigin = (request: Request, response: Response, next: NextFunction) => {
    const origin = request.get('origin');
    if (origin !== allowedOrigin) {
      errorResponse(response, 403, '请求来源不受信任', 'ORIGIN_REJECTED');
      return;
    }
    next();
  };

  const requireJson = (request: Request, response: Response, next: NextFunction) => {
    if (!request.is('application/json')) {
      errorResponse(response, 415, '请求必须使用 application/json', 'UNSUPPORTED_MEDIA_TYPE');
      return;
    }
    next();
  };

  const requireAdmin = (request: Request, response: Response, next: NextFunction) => {
    sweepSessions();
    const token = request.cookies?.[SESSION_COOKIE] as string | undefined;
    if (!token) {
      errorResponse(response, 401, '管理会话已失效，请重新登录', 'UNAUTHORIZED');
      return;
    }

    const digest = hashSessionToken(token, config.sessionSecret);
    const session = sessions.get(digest);
    if (!session || session.expiresAt <= Date.now()) {
      sessions.delete(digest);
      response.clearCookie(SESSION_COOKIE, { path: '/' });
      errorResponse(response, 401, '管理会话已失效，请重新登录', 'UNAUTHORIZED');
      return;
    }
    next();
  };

  app.get('/api/health', (_request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.json({ status: 'ok' });
  });

  app.post('/api/registrations', requireSameOrigin, requireJson, async (request, response, next) => {
    const rate = submitLimiter.consume(request.ip || 'unknown');
    if (!rate.allowed) {
      response.setHeader('Retry-After', String(rate.retryAfterSeconds));
      errorResponse(response, 429, '提交过于频繁，请稍后再试', 'RATE_LIMITED');
      return;
    }

    const parsed = registrationSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        error: '请检查填写内容',
        code: 'VALIDATION_ERROR',
        issues: parsed.error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
      });
      return;
    }

    const identityRate = identitySubmitLimiter.consume(
      `${request.ip || 'unknown'}|${stableDigest(parsed.data.idNumber)}`,
    );
    if (!identityRate.allowed) {
      response.setHeader('Retry-After', String(identityRate.retryAfterSeconds));
      errorResponse(response, 429, '同一报名信息提交过于频繁，请稍后再试', 'IDENTITY_RATE_LIMITED');
      return;
    }

    try {
      const result = await store.upsert(parsed.data);
      response.status(result.status === 'created' ? 201 : 200).json({
        ...result,
        maskedPhone: maskPhone(parsed.data.phone),
        maskedIdNumber: maskIdNumber(parsed.data.idNumber),
      });
    } catch (error) {
      if (error instanceof PhoneMismatchError) {
        errorResponse(response, 409, error.message, 'PHONE_MISMATCH');
        return;
      }
      next(error);
    }
  });

  app.post('/api/admin/login', requireSameOrigin, requireJson, async (request, response) => {
    const genericFailure = () => errorResponse(response, 401, '账号或密码错误', 'INVALID_CREDENTIALS');
    const parsed = adminLoginSchema.safeParse(request.body);
    if (!parsed.success) {
      genericFailure();
      return;
    }

    const rateKey = `${request.ip || 'unknown'}|${parsed.data.username.toLowerCase()}`;
    const broadRate = loginAttemptLimiter.consume(request.ip || 'unknown');
    const failureRate = loginFailureLimiter.check(rateKey);
    if (!broadRate.allowed || !failureRate.allowed) {
      const retryAfter = !broadRate.allowed
        ? broadRate.retryAfterSeconds
        : !failureRate.allowed
          ? failureRate.retryAfterSeconds
          : 1;
      response.setHeader('Retry-After', String(retryAfter));
      errorResponse(response, 429, '登录失败次数过多，请稍后再试', 'LOGIN_LOCKED');
      return;
    }

    const passwordValid = await verifyPassword(parsed.data.password, config.adminPasswordHash);
    const usernameValid = parsed.data.username === config.adminUsername;
    if (!passwordValid || !usernameValid) {
      loginFailureLimiter.fail(rateKey);
      genericFailure();
      return;
    }

    loginFailureLimiter.clear(rateKey);
    sweepSessions();
    const token = createSessionToken();
    sessions.set(hashSessionToken(token, config.sessionSecret), { expiresAt: Date.now() + SESSION_TTL_MS });
    response.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: secureCookies,
      path: '/',
      maxAge: SESSION_TTL_MS,
    });
    response.json({ ok: true });
  });

  app.post('/api/admin/logout', requireSameOrigin, (request, response) => {
    const token = request.cookies?.[SESSION_COOKIE] as string | undefined;
    if (token) sessions.delete(hashSessionToken(token, config.sessionSecret));
    response.clearCookie(SESSION_COOKIE, {
      httpOnly: true,
      sameSite: 'strict',
      secure: secureCookies,
      path: '/',
    });
    response.json({ ok: true });
  });

  app.get('/api/admin/export.csv', requireAdmin, async (_request, response, next) => {
    try {
      const records = await store.exportAll();
      const csv = registrationsToCsv(records);
      response.setHeader('Content-Type', 'text/csv; charset=utf-8');
      response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent('活动报名名单.csv')}`);
      response.setHeader('Cache-Control', 'no-store, private');
      response.send(csv);
    } catch (error) {
      next(error);
    }
  });

  app.get('/registration-qr.png', async (_request, response, next) => {
    try {
      const image = await getQrImage();
      response.setHeader('Content-Type', 'image/png');
      response.setHeader('Content-Disposition', 'inline; filename="registration-qr.png"');
      response.setHeader('Cache-Control', 'public, max-age=300');
      response.send(image);
    } catch (error) {
      next(error);
    }
  });

  const distDirectory = path.resolve(process.cwd(), 'dist');
  if (existsSync(distDirectory)) {
    app.use(express.static(distDirectory, { index: false, dotfiles: 'deny', maxAge: '1h' }));
    app.use((request, response, next) => {
      if (
        request.method !== 'GET' ||
        request.path === '/api' ||
        request.path.startsWith('/api/')
      ) {
        next();
        return;
      }
      response.setHeader('Cache-Control', 'no-cache');
      response.sendFile(path.join(distDirectory, 'index.html'));
    });
  }

  app.use('/api', (_request, response) => {
    errorResponse(response, 404, '接口不存在', 'NOT_FOUND');
  });

  const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
    const type = (error as { type?: string }).type;
    if (type === 'entity.too.large') {
      errorResponse(response, 413, '提交内容过大', 'PAYLOAD_TOO_LARGE');
      return;
    }
    if (error instanceof SyntaxError && 'body' in error) {
      errorResponse(response, 400, 'JSON 格式不正确', 'INVALID_JSON');
      return;
    }
    console.error('Request failed:', error instanceof Error ? error.message : 'unknown error');
    errorResponse(response, 500, '服务暂时不可用，请稍后重试', 'INTERNAL_ERROR');
  };
  app.use(errorHandler);

  return app;
}

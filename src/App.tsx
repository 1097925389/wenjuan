import { useEffect, useState } from 'react';
import {
  App as AntdApp,
  Button,
  Card,
  Checkbox,
  Form,
  Input,
  Radio,
  Result,
  Space,
  Switch,
  Tooltip,
  Typography,
} from 'antd';
import type { FormInstance, FormProps } from 'antd';
import {
  BankOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EnvironmentOutlined,
  FileProtectOutlined,
  FormOutlined,
  HomeOutlined,
  IdcardOutlined,
  LockOutlined,
  LogoutOutlined,
  MailOutlined,
  PhoneOutlined,
  PlusOutlined,
  PushpinOutlined,
  SafetyCertificateOutlined,
  SolutionOutlined,
  UserOutlined,
} from '@ant-design/icons';
import {
  EVENT_TITLE,
  MAX_FAMILY_MEMBERS,
  isValidChineseIdCard,
  isValidMainlandPhone,
  normalizeIdCard,
  registrationSchema,
} from '../shared/validation';
import type { ApiError, RegistrationInput, RegistrationSuccess } from '../shared/validation';

type FormValues = RegistrationInput;
type RegistrationFieldData = Parameters<FormInstance<FormValues>['setFields']>[0][number];

class RegistrationRequestError extends Error {
  constructor(
    readonly status: number,
    readonly payload: ApiError,
  ) {
    super(payload.error || '提交失败');
  }
}

async function submitRegistrationRequest(data: RegistrationInput): Promise<RegistrationSuccess> {
  const response = await fetch('/api/registrations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const payload = (await response.json()) as RegistrationSuccess | ApiError;
  if (!response.ok) throw new RegistrationRequestError(response.status, payload as ApiError);
  return payload as RegistrationSuccess;
}

const INITIAL_VALUES: Partial<FormValues> = {
  hasFamily: false,
  familyMembers: [],
  roomType: 'standard',
  otherNeeds: '',
  consent: false,
};

const textRequired = (label: string, max: number) => [
  { required: true, whitespace: true, message: `请填写${label}` },
  { max, message: `${label}不能超过${max}个字符` },
];

function TopNavbar() {
  return (
    <header className="navbar">
      <div className="navbar-heading">
        <span className="navbar-emblem" aria-hidden="true"><CalendarOutlined /></span>
        <div>
          <div className="navbar-title">会议信息登记</div>
          <div className="navbar-sub">AI 装备制造交流会 · 镇安</div>
        </div>
      </div>
      <span className="navbar-tag">嘉宾登记</span>
    </header>
  );
}

function BedIcon() {
  return (
    <svg
      className="bed-icon"
      viewBox="0 0 512 512"
      width="1em"
      height="1em"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M32 32C14.3 32 0 46.3 0 64v352c0 17.7 14.3 32 32 32s32-14.3 32-32v-32h384v32c0 17.7 14.3 32 32 32s32-14.3 32-32V256c0-53-43-96-96-96H224c-17.7 0-32 14.3-32 32v128H64V64c0-17.7-14.3-32-32-32zm80 128a48 48 0 1 0 0-96 48 48 0 1 0 0 96z" />
    </svg>
  );
}

function InvitationCard() {
  return (
    <section className="invitation-card" aria-labelledby="event-title">
      <div className="invitation-header">
        <span className="invitation-divider" aria-hidden="true" />
        <span className="invitation-badge"><MailOutlined aria-hidden="true" />会议邀请</span>
        <span className="invitation-divider" aria-hidden="true" />
      </div>

      <h1 className="invitation-title" id="event-title" aria-label={EVENT_TITLE}>
        <span className="invitation-title-slogan">知藏于文·智驭全局</span>
        <span className="invitation-title-name">
          人工智能赋能智能制造行业交流会
        </span>
      </h1>

      <p className="invitation-greeting">
        <UserOutlined aria-hidden="true" />
        尊敬的嘉宾，诚邀您拨冗莅临，共探数智化转型新路径
      </p>

      <div className="invitation-meta">
        <div className="invitation-meta-item">
          <CalendarOutlined aria-hidden="true" />
          <strong>日期</strong>
          <span className="invitation-meta-value">2026年9月12日 – 9月13日</span>
        </div>
        <div className="invitation-meta-item">
          <ClockCircleOutlined aria-hidden="true" />
          <strong>时间</strong>
          <span className="invitation-meta-value invitation-time-value">
            <span>09:00 – 20:30（12日）</span>
            <span>09:00 – 13:30（13日）</span>
          </span>
        </div>
        <div className="invitation-meta-item">
          <PushpinOutlined aria-hidden="true" />
          <strong>地点</strong>
          <span className="invitation-meta-value">镇安缤悦大酒店 <span className="highlight">主会场</span></span>
        </div>
        <div className="invitation-meta-item">
          <EnvironmentOutlined aria-hidden="true" />
          <strong>集合点</strong>
          <span className="invitation-meta-value">延长壳牌西安金陶长安南路加油站（地铁2号线电视塔E1口南200m）</span>
        </div>
      </div>

    </section>
  );
}

function applyApiValidationErrors(form: FormInstance<FormValues>, error: ApiError) {
  if (!error.issues?.length) return;
  form.setFields(
    error.issues.map((issue) => ({
      name: issue.path as RegistrationFieldData['name'],
      errors: [issue.message],
    })),
  );
}

export function RegistrationPage({
  initialValues = INITIAL_VALUES,
}: {
  initialValues?: Partial<FormValues>;
}) {
  const [form] = Form.useForm<FormValues>();
  const { message, notification } = AntdApp.useApp();
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<RegistrationSuccess | null>(null);
  const hasFamily = Form.useWatch('hasFamily', form);

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const inputSchema = {
      type: 'object',
      additionalProperties: false,
      required: [
        'name',
        'phone',
        'organization',
        'jobTitle',
        'idNumber',
        'hasFamily',
        'familyMembers',
        'roomType',
        'otherNeeds',
        'consent',
      ],
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 50 },
        phone: { type: 'string', pattern: '^1[3-9]\\d{9}$' },
        organization: { type: 'string', minLength: 1, maxLength: 100 },
        jobTitle: { type: 'string', minLength: 1, maxLength: 50 },
        idNumber: { type: 'string', pattern: '^\\d{17}[\\dXx]$' },
        hasFamily: { type: 'boolean' },
        familyMembers: {
          type: 'array',
          maxItems: MAX_FAMILY_MEMBERS,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['name', 'idNumber'],
            properties: {
              name: { type: 'string', minLength: 1, maxLength: 50 },
              idNumber: { type: 'string', pattern: '^\\d{17}[\\dXx]$' },
            },
          },
        },
        roomType: { type: 'string', enum: ['standard', 'single'] },
        otherNeeds: { type: 'string', maxLength: 500 },
        consent: { const: true },
      },
    };

    try {
      void Promise.resolve(
        context.registerTool(
          {
            name: 'submit_event_registration',
            title: '提交活动报名',
            description: '提交或更新本次人工智能赋能智能制造行业交流会报名；调用会立即写入报名记录。',
            inputSchema,
            annotations: { readOnlyHint: false, untrustedContentHint: false },
            execute: async (input) => {
              const parsed = registrationSchema.safeParse(input);
              if (!parsed.success) throw new Error('报名信息校验失败');
              form.setFieldsValue(parsed.data);
              const response = await submitRegistrationRequest(parsed.data);
              setResult(response);
              return {
                status: response.status,
                registrationId: response.registrationId,
                maskedPhone: response.maskedPhone,
                maskedIdNumber: response.maskedIdNumber,
              };
            },
          },
          { signal: lifecycle.signal },
        ),
      ).catch(() => undefined);
    } catch {
      // Unsupported or partial WebMCP implementations must not affect the visible form.
    }

    return () => lifecycle.abort();
  }, [form]);

  const revalidateIdentityFields = () => {
    const families = form.getFieldValue('familyMembers') ?? [];
    const names: Array<Array<string | number>> = [['idNumber']];
    families.forEach((_: unknown, index: number) => names.push(['familyMembers', index, 'idNumber']));
    void form.validateFields(names).catch(() => undefined);
  };

  const handleFamilyChoice = (value: boolean) => {
    form.setFieldValue('hasFamily', value);
    if (value) {
      if ((form.getFieldValue('familyMembers') ?? []).length === 0) {
        form.setFieldValue('familyMembers', [{ name: '', idNumber: '' }]);
      }
    } else {
      form.setFieldValue('familyMembers', []);
      form.setFields([{ name: ['familyMembers'], errors: [] }]);
    }
  };

  const familyIdRules = (index: number) => [
    { required: true, message: '请填写家属身份证号' },
    {
      validator: async (_: unknown, rawValue?: string) => {
        if (!rawValue) return;
        const current = normalizeIdCard(rawValue);
        if (!isValidChineseIdCard(current)) throw new Error('请输入有效的18位身份证号');

        const applicant = normalizeIdCard(form.getFieldValue('idNumber') ?? '');
        if (current === applicant) throw new Error('身份证号与本人重复');

        const families = form.getFieldValue('familyMembers') ?? [];
        const duplicateIndex = families.findIndex(
          (family: { idNumber?: string }, familyIndex: number) =>
            familyIndex !== index && normalizeIdCard(family?.idNumber ?? '') === current,
        );
        if (duplicateIndex >= 0) throw new Error(`身份证号与家属${duplicateIndex + 1}重复`);
      },
    },
  ];

  const onFinish: FormProps<FormValues>['onFinish'] = async (values) => {
    if (submitting) return;

    const parsed = registrationSchema.safeParse(values);
    if (!parsed.success) {
      form.setFields(
        parsed.error.issues.map((issue) => ({
          name: issue.path as RegistrationFieldData['name'],
          errors: [issue.message],
        })),
      );
      const firstPath = parsed.error.issues[0]?.path;
      if (firstPath) {
        form.scrollToField(firstPath as RegistrationFieldData['name'], {
          behavior: 'smooth',
          block: 'center',
        });
      }
      return;
    }

    setSubmitting(true);
    try {
      const payload = await submitRegistrationRequest(parsed.data);
      setResult(payload);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      if (error instanceof RegistrationRequestError) {
        const apiError = error.payload;
        applyApiValidationErrors(form, apiError);
        if (error.status === 409) {
          notification.error({
            title: '无法更新报名',
            description: '该身份证号已登记，但手机号与原报名不一致。请核对后重试。',
            placement: 'top',
          });
        } else if (error.status === 429) {
          message.warning('提交过于频繁，请稍后再试');
        } else {
          message.error(apiError.error || '提交失败，请稍后重试');
        }
        return;
      }
      notification.error({
        title: '暂时无法提交',
        description: '请检查网络连接后重试，已填写的内容不会丢失。',
        placement: 'top',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const resetForAnother = () => {
    form.resetFields();
    setResult(null);
  };

  if (result) {
    return (
      <div className="registration-page">
        <TopNavbar />
        <main className="page-content result-content">
          <InvitationCard />
          <Card className="form-card result-card" variant="borderless">
            <Result
              status="success"
              title={result.status === 'created' ? '报名提交成功' : '报名信息已更新'}
              subTitle={`报名编号：${result.registrationId}`}
              extra={
                <Space wrap>
                  <Button type="primary" onClick={() => setResult(null)}>
                    返回修改信息
                  </Button>
                  <Button onClick={resetForAnother}>登记另一位</Button>
                </Space>
              }
            >
              <div className="result-summary" aria-label="报名信息摘要">
                <div className="result-summary-row">
                  <span>手机号</span>
                  <strong>{result.maskedPhone}</strong>
                </div>
                <div className="result-summary-row">
                  <span>身份证号</span>
                  <strong>{result.maskedIdNumber}</strong>
                </div>
              </div>
            </Result>
          </Card>
          <PageFooter />
        </main>
      </div>
    );
  }

  return (
    <div className="registration-page">
      <TopNavbar />
      <main className="page-content">
        <InvitationCard />
        <Form<FormValues>
          className="registration-form"
          form={form}
          layout="vertical"
          initialValues={initialValues}
          onFinish={onFinish}
          scrollToFirstError={{ behavior: 'smooth', block: 'center' }}
          requiredMark
          size="large"
        >
          <section className="form-section-card" aria-labelledby="basic-info-title">
            <div className="card-section-title" id="basic-info-title">
              <UserOutlined aria-hidden="true" />基本信息
              <span className="section-badge">必填</span>
            </div>
            <Form.Item label="姓名" name="name" rules={textRequired('姓名', 50)}>
              <Input prefix={<UserOutlined />} placeholder="请输入您的姓名" autoComplete="name" maxLength={50} />
            </Form.Item>

            <Form.Item
              label="手机号"
              name="phone"
              rules={[
                { required: true, message: '请填写手机号' },
                {
                  validator: async (_, value?: string) => {
                    if (value && !isValidMainlandPhone(value)) {
                      throw new Error('请输入有效的11位大陆手机号');
                    }
                  },
                },
              ]}
            >
              <Input
                prefix={<PhoneOutlined />}
                placeholder="请输入手机号"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                maxLength={11}
              />
            </Form.Item>

            <Form.Item label="单位" name="organization" rules={textRequired('单位', 100)}>
              <Input prefix={<BankOutlined />} placeholder="请输入您所在单位" autoComplete="organization" maxLength={100} />
            </Form.Item>

            <Form.Item label="职务" name="jobTitle" rules={textRequired('职务', 50)}>
              <Input prefix={<SolutionOutlined />} placeholder="请输入职务" autoComplete="organization-title" maxLength={50} />
            </Form.Item>

            <Form.Item
              label={(
                <span>
                  身份证号 <span className="id-purpose">（用于<span className="id-insurance">保险</span>及入住）</span>
                </span>
              )}
              name="idNumber"
              normalize={(value) => normalizeIdCard(value ?? '')}
              rules={[
                { required: true, message: '请填写身份证号' },
                {
                  validator: async (_, value?: string) => {
                    if (value && !isValidChineseIdCard(value)) {
                      throw new Error('请输入有效的18位身份证号');
                    }
                  },
                },
              ]}
            >
              <Input
                prefix={<IdcardOutlined />}
                placeholder="请输入18位身份证号"
                autoComplete="off"
                maxLength={18}
                onBlur={revalidateIdentityFields}
              />
            </Form.Item>

            <div className="privacy-hint">
              <SafetyCertificateOutlined /> 身份证信息仅用于本次活动<span className="id-insurance">保险</span>及入住办理，请确认内容准确。
            </div>
          </section>

          <section className="form-section-card" aria-labelledby="stay-info-title">
            <div className="card-section-title" id="stay-info-title">
              <HomeOutlined aria-hidden="true" />住宿与家属
              <span className="section-badge">必填</span>
            </div>
            <Form.Item
              className="family-choice-item"
              layout="horizontal"
              label="是否携带家属"
              name="hasFamily"
              valuePropName="checked"
              required
              rules={[
                {
                  validator: async (_, value) => {
                    if (typeof value !== 'boolean') throw new Error('请选择是否携带家属');
                  },
                },
              ]}
            >
              <Switch
                className="family-switch"
                checkedChildren="是"
                unCheckedChildren="否"
                onChange={handleFamilyChoice}
              />
            </Form.Item>

            <Form.List name="familyMembers">
              {(fields, { add, remove }, { errors }) =>
                hasFamily ? (
                  <div className="family-panel" aria-live="polite">
                      {fields.map((field, index) => (
                        <div className="family-item" key={field.key}>
                          <div className="family-item-title">
                            <span>家属 {index + 1}</span>
                            <Tooltip title={fields.length === 1 ? '至少保留1位家属' : '删除这位家属'}>
                              <Button
                                type="text"
                                danger
                                icon={<DeleteOutlined />}
                                disabled={fields.length === 1}
                                aria-label={`删除家属${index + 1}`}
                                onClick={() => {
                                  remove(field.name);
                                  queueMicrotask(revalidateIdentityFields);
                                }}
                              />
                            </Tooltip>
                          </div>
                          <Form.Item
                            label="家属姓名"
                            name={[field.name, 'name']}
                            rules={textRequired('家属姓名', 50)}
                          >
                            <Input
                              prefix={<UserOutlined />}
                              placeholder="请输入家属姓名"
                              autoComplete="off"
                              maxLength={50}
                            />
                          </Form.Item>
                          <Form.Item
                            label="家属身份证号"
                            name={[field.name, 'idNumber']}
                            normalize={(value) => normalizeIdCard(value ?? '')}
                            rules={familyIdRules(index)}
                          >
                            <Input
                              prefix={<IdcardOutlined />}
                              placeholder="请输入18位身份证号"
                              autoComplete="off"
                              maxLength={18}
                              onBlur={revalidateIdentityFields}
                            />
                          </Form.Item>
                        </div>
                      ))}
                      <Form.ErrorList errors={errors} />
                      {fields.length < MAX_FAMILY_MEMBERS && (
                        <Button
                          className="add-family-button"
                          type="dashed"
                          block
                          icon={<PlusOutlined />}
                          onClick={() => add({ name: '', idNumber: '' })}
                        >
                          添加家属（最多{MAX_FAMILY_MEMBERS}人）
                        </Button>
                      )}
                  </div>
                ) : null
              }
            </Form.List>

            <Form.Item
              label="房型选择"
              name="roomType"
              rules={[{ required: true, message: '请选择房型' }]}
            >
              <Radio.Group className="room-radio-group">
                <Radio.Button value="standard">
                  <span className="room-bed-icons" aria-hidden="true"><BedIcon /><BedIcon /></span>
                  <span>标间</span>
                </Radio.Button>
                <Radio.Button value="single">
                  <span className="room-bed-icons room-bed-icons-single" aria-hidden="true"><BedIcon /></span>
                  <span>单间</span>
                </Radio.Button>
              </Radio.Group>
            </Form.Item>
          </section>

          <section className="form-section-card other-needs-card" aria-labelledby="other-needs-title">
            <div className="card-section-title" id="other-needs-title">
              <FormOutlined aria-hidden="true" />其他需求
              <span className="section-badge optional-badge">选填</span>
            </div>
            <Form.Item label="其他需求" name="otherNeeds" rules={[{ max: 500, message: '其他需求不能超过500个字符' }]}>
              <Input.TextArea
                placeholder="如有特殊饮食、住宿等需求，请在此注明…"
                rows={4}
                maxLength={500}
                showCount
              />
            </Form.Item>
          </section>

          <section className="form-section-card consent-card">
            <div className="consent-box">
              <Form.Item
                name="consent"
                valuePropName="checked"
                rules={[
                  {
                    validator: async (_, checked) => {
                      if (!checked) throw new Error('请确认信息并同意信息收集说明');
                    },
                  },
                ]}
              >
                <Checkbox>
                  <strong>确认信息无误</strong> — 我已核对所填信息真实、准确，并同意主办方为本次活动报名、保险及入住安排收集和使用本人及随行家属信息。
                </Checkbox>
              </Form.Item>
            </div>
          </section>

          <PageFooter />
          <div className="submit-area">
            <Button
              className="submit-button"
              type="primary"
              htmlType="submit"
              block
              icon={<CheckCircleOutlined />}
              loading={submitting}
              disabled={submitting}
            >
              {submitting ? '正在安全提交…' : <><span className="visually-hidden">确认提交</span>提交登记</>}
            </Button>
          </div>
        </Form>
      </main>
    </div>
  );
}

function PageFooter() {
  return (
    <footer className="page-footer">
      <div className="footer-copy">
        <p>本页面仅用于本次会议嘉宾信息登记</p>
        <p>请勿在公共设备上保存或转发本人及家属证件信息</p>
      </div>
      <p className="footer-owner">会议会务组 · 2026</p>
    </footer>
  );
}

function ExportPage() {
  const { message } = AntdApp.useApp();
  const [loggedIn, setLoggedIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const login = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const payload = (await response.json()) as ApiError | { ok: true };
      if (!response.ok) {
        message.error((payload as ApiError).error || '登录失败');
        return;
      }
      setLoggedIn(true);
      message.success('验证成功');
    } catch {
      message.error('无法连接服务，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const downloadCsv = async () => {
    setDownloading(true);
    try {
      const response = await fetch('/api/admin/export.csv');
      if (response.status === 401) {
        setLoggedIn(false);
        message.error('登录已过期，请重新验证');
        return;
      }
      if (!response.ok) throw new Error('download failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = '活动报名名单.csv';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      message.success('名单已开始下载');
    } catch {
      message.error('名单下载失败，请稍后重试');
    } finally {
      setDownloading(false);
    }
  };

  const logout = async () => {
    setLoggingOut(true);
    try {
      const response = await fetch('/api/admin/logout', { method: 'POST' });
      if (!response.ok) throw new Error('logout failed');
      setLoggedIn(false);
      message.success('已安全退出');
    } catch {
      message.error('退出失败，请重试；在公共设备上请直接关闭浏览器');
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <main className="site-shell export-shell">
      <Card className="export-card" variant="borderless">
        <div className="export-heading">
          <FileProtectOutlined className="export-icon" aria-hidden="true" />
          <h1>报名名单导出</h1>
          <p>此入口仅用于主办方下载加密存储的报名名单。</p>
        </div>
        {loggedIn ? (
          <Space orientation="vertical" size={14} style={{ width: '100%' }}>
            <Button
              type="primary"
              size="large"
              block
              icon={<DownloadOutlined />}
              loading={downloading}
              disabled={downloading || loggingOut}
              onClick={downloadCsv}
            >
              下载 CSV 名单
            </Button>
            <Button
              size="large"
              block
              icon={<LogoutOutlined />}
              loading={loggingOut}
              disabled={downloading || loggingOut}
              onClick={logout}
            >
              退出登录
            </Button>
          </Space>
        ) : (
          <Form layout="vertical" size="large" onFinish={login}>
            <Form.Item label="账号" name="username" rules={[{ required: true, message: '请输入账号' }]}>
              <Input prefix={<LockOutlined />} autoComplete="username" placeholder="请输入管理账号" />
            </Form.Item>
            <Form.Item label="密码" name="password" rules={[{ required: true, message: '请输入密码' }]}>
              <Input.Password autoComplete="current-password" placeholder="请输入管理密码" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading} disabled={loading}>
              验证并进入
            </Button>
          </Form>
        )}
        <p className="export-security-note">
          名单含敏感个人信息。请仅在受控设备下载，并妥善保存、及时清理。
        </p>
        <Typography.Link href="/">返回报名页</Typography.Link>
      </Card>
    </main>
  );
}

export default function App() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  return path === '/export' ? <ExportPage /> : <RegistrationPage />;
}

// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App as AntdApp, ConfigProvider } from 'antd';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import App, { RegistrationPage } from '../src/App';
import { validRegistration } from './helpers';

function renderApp(content: ReactNode = <App />) {
  return render(
    <ConfigProvider>
      <AntdApp>
        {content}
      </AntdApp>
    </ConfigProvider>,
  );
}

function buttonWithText(text: string | RegExp): HTMLButtonElement {
  const button = screen.getByText(text).closest('button');
  if (!button) throw new Error(`找不到按钮：${String(text)}`);
  return button;
}

function apiSuccess(status: 'created' | 'updated' = 'created') {
  return {
    ok: true,
    status: status === 'created' ? 201 : 200,
    json: async () => ({
      status,
      registrationId: 'REG-ABCDEF1234',
      maskedPhone: '138****8000',
      maskedIdNumber: '990000********0017',
    }),
  };
}

describe('移动端报名表单', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(document, 'modelContext', { configurable: true, value: undefined });
    window.history.replaceState({}, '', '/');
  });

  it('按选择创建、限制并清空家属字段', async () => {
    renderApp();

    expect(document.querySelector('.event-header img')).not.toBeInTheDocument();
    expect(document.querySelector('.footer-brands img:first-child')).toHaveAttribute(
      'src',
      '/brands/brand-mark.png',
    );
    expect(screen.getByAltText('云栖数据')).toBeInTheDocument();
    expect(screen.queryByText('家属 1')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('是'));
    expect(await screen.findByText('家属 1')).toBeInTheDocument();

    const addButton = () => screen.queryByText(/添加家属/);
    for (let index = 0; index < 4; index += 1) {
      fireEvent.click(addButton()!);
    }
    expect(await screen.findByText('家属 5')).toBeInTheDocument();
    expect(addButton()).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('否'));
    await waitFor(() => expect(screen.queryByText('家属 1')).not.toBeInTheDocument());
  });

  it('提交期间锁定按钮防止重复，并展示创建结果和脱敏摘要', async () => {
    let resolveRequest!: (value: ReturnType<typeof apiSuccess>) => void;
    const fetchMock = vi.fn(
      () => new Promise<ReturnType<typeof apiSuccess>>((resolve) => (resolveRequest = resolve)),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderApp(<RegistrationPage initialValues={validRegistration()} />);

    fireEvent.click(buttonWithText('确认提交'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1), { timeout: 10_000 });
    const submittingButton = document.querySelector<HTMLButtonElement>('.submit-button')!;
    expect(submittingButton).toBeDisabled();
    expect(submittingButton).toHaveTextContent('正在安全提交');
    fireEvent.click(submittingButton);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => resolveRequest(apiSuccess()));
    expect(await screen.findByText('报名提交成功')).toBeInTheDocument();
    expect(screen.getByText('报名编号：REG-ABCDEF1234')).toBeInTheDocument();
    expect(screen.getByText('138****8000')).toBeInTheDocument();
    expect(screen.getByText('990000********0017')).toBeInTheDocument();
  }, 30_000);

  it('展示更新结果', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(apiSuccess('updated')));
    renderApp(<RegistrationPage initialValues={validRegistration()} />);
    fireEvent.click(buttonWithText('确认提交'));
    expect(await screen.findByText('报名信息已更新')).toBeInTheDocument();
  }, 30_000);

  it('手机号不匹配时保留表单并允许重试', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ error: '该身份证号已登记，但手机号不匹配' }),
      }),
    );
    renderApp(<RegistrationPage initialValues={validRegistration()} />);
    fireEvent.click(buttonWithText('确认提交'));

    expect(await screen.findByText('无法更新报名')).toBeInTheDocument();
    expect(screen.getByLabelText('姓名')).toHaveValue('测试报名者');
    expect(buttonWithText('确认提交')).toBeEnabled();
  }, 30_000);

  it('网络失败时保留表单并恢复提交按钮', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network unavailable')));
    renderApp(<RegistrationPage initialValues={validRegistration()} />);
    fireEvent.click(buttonWithText('确认提交'));

    expect(await screen.findByText('暂时无法提交')).toBeInTheDocument();
    expect(screen.getByLabelText('手机号')).toHaveValue('13800138000');
    expect(buttonWithText('确认提交')).toBeEnabled();
  }, 30_000);

  it('注册与可见提交行为一致的 WebMCP 工具', async () => {
    let registeredTool: WebMcpTool | undefined;
    Object.defineProperty(document, 'modelContext', {
      configurable: true,
      value: {
        registerTool: (tool: WebMcpTool) => {
          registeredTool = tool;
        },
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({
          status: 'created',
          registrationId: 'REG-ABCDEF1234',
          maskedPhone: '138****8000',
          maskedIdNumber: '990000********0017',
        }),
      }),
    );

    renderApp();
    await waitFor(() => expect(registeredTool?.name).toBe('submit_event_registration'));
    expect(registeredTool?.annotations?.readOnlyHint).toBe(false);
    await expect(registeredTool!.execute({})).rejects.toThrow('报名信息校验失败');
    let toolResult: unknown;
    await act(async () => {
      toolResult = await registeredTool!.execute(validRegistration());
    });
    expect(toolResult).toMatchObject({
      status: 'created',
      registrationId: 'REG-ABCDEF1234',
    });
  });
});

describe('管理员导出页', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState({}, '', '/');
  });

  async function login(fetchMock: ReturnType<typeof vi.fn>) {
    vi.stubGlobal('fetch', fetchMock);
    window.history.replaceState({}, '', '/export');
    renderApp();
    fireEvent.change(screen.getByLabelText('账号'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'admin123' } });
    fireEvent.click(buttonWithText('验证并进入'));
    expect(await screen.findByText('下载 CSV 名单')).toBeInTheDocument();
  }

  it('下载遇到会话过期时返回登录表单', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true }) })
      .mockResolvedValueOnce({ ok: false, status: 401 });
    await login(fetchMock);

    fireEvent.click(buttonWithText('下载 CSV 名单'));
    expect(await screen.findByText('登录已过期，请重新验证')).toBeInTheDocument();
    expect(screen.getByLabelText('账号')).toBeInTheDocument();
  });

  it('退出失败时不误报成功并保持登录状态', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true }) })
      .mockResolvedValueOnce({ ok: false, status: 500 });
    await login(fetchMock);

    fireEvent.click(buttonWithText('退出登录'));
    expect(await screen.findByText('退出失败，请重试；在公共设备上请直接关闭浏览器')).toBeInTheDocument();
    expect(buttonWithText('下载 CSV 名单')).toBeInTheDocument();
  });
});

import { useState } from 'react';
import { Button, Card, Col, Divider, Form, Input, Row, Typography, message } from 'antd';
import { LockOutlined, LoginOutlined, UserOutlined } from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../services/api';
import { DEMO_ACCOUNTS } from '../mock/seed';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm<{ username: string; password: string }>();

  const onFinish = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      const user = await login(values.username, values.password);
      message.success(`Xin chào ${user.fullName}!`);
      navigate(from, { replace: true });
    } catch (e) {
      message.error(e instanceof ApiError ? e.message : 'Đăng nhập thất bại. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="eqms-login-wrap">
      <Row gutter={32} align="middle" style={{ width: '100%', maxWidth: 1000 }}>
        <Col xs={24} md={11}>
          <div className="eqms-login-side">
            <Typography.Title level={2} style={{ color: '#fff', marginBottom: 8 }}>
              DMC eQMS
            </Typography.Title>
            <Typography.Paragraph style={{ color: 'rgba(255,255,255,0.9)', fontSize: 15 }}>
              Hệ thống quản lý ISO & Chất lượng điện tử – thay thế các file Excel rời rạc bằng một
              nguồn dữ liệu tập trung.
            </Typography.Paragraph>
            <Typography.Paragraph style={{ color: 'rgba(255,255,255,0.75)' }}>
              • ISO Master Plan T10/2026 – T12/2027
              <br />
              • Document Control: soạn thảo → thẩm định → phê duyệt → ban hành
              <br />
              • Action/CAPA theo deadline và evidence
              <br />
              • Phân quyền chi tiết theo từng vai trò ISO
            </Typography.Paragraph>
          </div>
        </Col>

        <Col xs={24} md={13}>
          <Card
            title="Đăng nhập"
            styles={{ body: { padding: 24 } }}
            style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.15)' }}
          >
            <Form
              form={form}
              layout="vertical"
              onFinish={onFinish}
              initialValues={{ username: '', password: '' }}
            >
              <Form.Item
                name="username"
                label="Tên đăng nhập"
                rules={[{ required: true, message: 'Bắt buộc nhập tên đăng nhập' }]}
              >
                <Input prefix={<UserOutlined />} placeholder="admin" autoFocus autoComplete="username" />
              </Form.Item>
              <Form.Item
                name="password"
                label="Mật khẩu"
                rules={[{ required: true, message: 'Bắt buộc nhập mật khẩu' }]}
              >
                <Input.Password
                  prefix={<LockOutlined />}
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </Form.Item>
              <Button type="primary" htmlType="submit" block loading={loading} icon={<LoginOutlined />}>
                Đăng nhập
              </Button>
            </Form>

            <Divider plain>Tài khoản demo (bấm để điền nhanh)</Divider>
            <div>
              {DEMO_ACCOUNTS.map((acc) => (
                <Button
                  key={acc.username}
                  size="small"
                  className="eqms-demo-btn"
                  onClick={() =>
                    form.setFieldsValue({ username: acc.username, password: acc.password })
                  }
                >
                  {acc.label}
                </Button>
              ))}
            </div>
            <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
              Mỗi tài khoản có tập quyền khác nhau – thử đổi vai trò để thấy menu/nút thay đổi.
            </Typography.Paragraph>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

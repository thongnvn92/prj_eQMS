import type { ReactNode } from 'react';
import { Avatar, Dropdown, Layout, Menu, Space, Tag, Typography } from 'antd';
import {
  BarChartOutlined,
  CarryOutOutlined,
  DashboardOutlined,
  FileTextOutlined,
  LogoutOutlined,
  ScheduleOutlined,
  SettingOutlined,
  UserOutlined,
  WarningOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import type { Permission } from '../auth/permissions';

const { Header, Sider, Content } = Layout;

/** Chiều cao Header (mặc định antd) – dùng để Sider dính ngay dưới header. */
const HEADER_HEIGHT = 64;

interface NavItem {
  key: string;
  label: string;
  icon: ReactNode;
  perm: Permission;
}

const NAV: NavItem[] = [
  { key: '/', label: 'Dashboard', icon: <DashboardOutlined />, perm: 'dashboard.view' },
  { key: '/master-plan', label: 'Master Plan ISO', icon: <ScheduleOutlined />, perm: 'master_plan.view' },
  { key: '/gantt', label: 'Gantt tiến độ', icon: <BarChartOutlined />, perm: 'master_plan.view' },
  { key: '/risks', label: 'Rủi ro', icon: <WarningOutlined />, perm: 'risk.view' },
  { key: '/opportunities', label: 'Cơ hội', icon: <RobotOutlined />, perm: 'opportunity.view' },
  { key: '/documents', label: 'Tài liệu (Documents)', icon: <FileTextOutlined />, perm: 'document.view' },
  { key: '/actions', label: 'Action / CAPA', icon: <CarryOutOutlined />, perm: 'action.view' },
  { key: '/admin', label: 'Quản trị', icon: <SettingOutlined />, perm: 'user.view' },
];

export default function AppLayout() {
  const { user, logout, can } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // Menu chỉ hiển thị những mục user có quyền (FR-ORG / UX)
  const menuItems = NAV.filter((n) => can(n.perm)).map((n) => ({
    key: n.key,
    icon: n.icon,
    label: n.label,
  }));

  const selectedKey =
    NAV.map((n) => n.key).find(
      (k) => location.pathname === k || (k !== '/' && location.pathname.startsWith(k)),
    ) ?? '/';

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingInline: 20,
          background: '#001524',
          position: 'sticky',
          top: 0,
          zIndex: 100,
          height: HEADER_HEIGHT,
          lineHeight: `${HEADER_HEIGHT}px`,
        }}
      >
        <Space size="middle">
          <span className="eqms-logo">DMC eQMS</span>
          <Typography.Text style={{ color: 'rgba(255,255,255,0.65)' }} type="secondary">
            Hệ thống quản lý ISO & Chất lượng điện tử
          </Typography.Text>
        </Space>
        <Space size="middle">
          {user && user.roleNames.length > 0 && <Tag color="blue">{user.roleNames[0]}</Tag>}
          <Tag>{user?.departmentName}</Tag>
          <Dropdown
            menu={{
              items: [
                {
                  key: 'logout',
                  icon: <LogoutOutlined />,
                  label: 'Đăng xuất',
                  onClick: () => {
                    logout();
                    navigate('/login', { replace: true });
                  },
                },
              ],
            }}
          >
            <Space style={{ cursor: 'pointer' }}>
              <Avatar size="small" icon={<UserOutlined />} style={{ backgroundColor: '#1677ff' }} />
              <span style={{ color: '#fff' }}>{user?.fullName}</span>
            </Space>
          </Dropdown>
        </Space>
      </Header>

      <Layout>
        <Sider
          width={240}
          theme="light"
          style={{
            borderRight: '1px solid #f0f0f0',
            // Sidebar đứng yên khi scroll: dính ngay dưới header, tự cuộn nếu menu dài.
            position: 'sticky',
            top: HEADER_HEIGHT,
            height: `calc(100vh - ${HEADER_HEIGHT}px)`,
            overflow: 'auto',
            left: 0,
          }}
        >
          <div style={{ padding: '14px 16px 6px', fontWeight: 600, color: '#595959' }}>Phân hệ</div>
          <Menu
            mode="inline"
            items={menuItems}
            selectedKeys={[selectedKey]}
            onClick={({ key }) => navigate(key)}
            style={{ borderInlineEnd: 'none' }}
          />
        </Sider>
        <Content style={{ padding: '16px 20px' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}

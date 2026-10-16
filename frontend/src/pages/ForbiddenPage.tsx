import { Button, Result } from 'antd';
import { useNavigate } from 'react-router-dom';

export default function ForbiddenPage() {
  const navigate = useNavigate();
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f5f6fa',
        padding: 16,
      }}
    >
      <Result
        status="403"
        title="403 – Không có quyền truy cập"
        subTitle="Bạn không sở hữu quyền cần thiết để mở phân hệ này. Hãy liên hệ System Admin nếu cho rằng đây là sai sót phân quyền."
        extra={
          <Button type="primary" onClick={() => navigate('/')}>
            Về Dashboard
          </Button>
        }
      />
    </div>
  );
}

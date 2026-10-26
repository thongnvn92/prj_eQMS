import { Space, Tag } from 'antd';
import { TASK_STATUS } from './widgets';

export default function TaskStatusLegend() {
  return (
    <Space size={8} wrap>
      {Object.keys(TASK_STATUS).map((key) => (
        <Tag key={key} color={TASK_STATUS[key].color} style={{ marginInlineEnd: 0 }}>
          {TASK_STATUS[key].label}
        </Tag>
      ))}
      <Tag color="red" style={{ marginInlineEnd: 0 }}>
        Viền đỏ = Overdue
      </Tag>
    </Space>
  );
}

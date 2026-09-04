import { Tabs } from 'antd';
import ClusterBoard from './K8sBoard';
import ResourceExplorer from './K8sResources';

export default function K8s() {
  return (
    <Tabs defaultActiveKey="board" items={[
      { key: 'board', label: '集群看板', children: <ClusterBoard /> },
      { key: 'res', label: '资源管理', children: <ResourceExplorer /> },
    ]} />
  );
}

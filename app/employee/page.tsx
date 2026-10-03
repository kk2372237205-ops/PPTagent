import EmployeeApp from "@/components/employee-app";
import { currentEmployeeAccess } from "@/lib/employee-auth";
import "./employee.css";

// 员工首页要读取当前会话和本地工作区，不能在生产构建阶段静态预渲染。
export const dynamic = "force-dynamic";

export default async function EmployeePage() {
  const access = await currentEmployeeAccess();
  return <EmployeeApp initialAuthenticated={!!access} />;
}

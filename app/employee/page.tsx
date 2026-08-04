import EmployeeApp from "@/components/employee-app";
import { currentEmployeeAccess } from "@/lib/employee-auth";
import "./employee.css";

export default async function EmployeePage() {
  const access = await currentEmployeeAccess();
  return <EmployeeApp initialAuthenticated={!!access} />;
}

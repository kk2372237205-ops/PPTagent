import EmployeeApp from "@/components/employee-app";
import { currentEmployee } from "@/lib/employee-auth";
import "./employee.css";

export default async function EmployeePage() {
  const employee = await currentEmployee();
  return <EmployeeApp initialAuthenticated={!!employee} />;
}

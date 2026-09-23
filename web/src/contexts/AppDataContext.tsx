import { createContext, useContext, type ReactNode } from 'react';
import { useEmployees } from '../data/employees';
import { useDepartments } from '../data/departments';
import { useDesignations } from '../data/designations';

const AppDataContext = createContext<AppDataContextValue | undefined>(undefined);

type EmployeeData = ReturnType<typeof useEmployees>;
type DepartmentData = ReturnType<typeof useDepartments>;
type DesignationData = ReturnType<typeof useDesignations>;

interface AppDataContextValue {
    employees: EmployeeData['employees'];
    employeesLoading: EmployeeData['loading'];
    employeesError: EmployeeData['error'];
    addEmployee: EmployeeData['addEmployee'];
    updateEmployee: EmployeeData['updateEmployee'];
    toggleEmployeeStatus: EmployeeData['toggleStatus'];
    refreshEmployees: EmployeeData['refresh'];
    departments: DepartmentData['departments'];
    departmentsLoading: DepartmentData['loading'];
    departmentsError: DepartmentData['error'];
    addDepartment: DepartmentData['addDepartment'];
    removeDepartment: DepartmentData['removeDepartment'];
    refreshDepartments: DepartmentData['refresh'];
    designations: DesignationData['designations'];
    designationsLoading: DesignationData['loading'];
    designationsError: DesignationData['error'];
    addDesignation: DesignationData['addDesignation'];
    removeDesignation: DesignationData['removeDesignation'];
    refreshDesignations: DesignationData['refresh'];
}

export function AppDataProvider({ children }: { children: ReactNode }) {
    const employeeData = useEmployees();
    const departmentData = useDepartments();
    const designationData = useDesignations();

    return (
        <AppDataContext.Provider
            value={{
                employees: employeeData.employees,
                employeesLoading: employeeData.loading,
                employeesError: employeeData.error,
                addEmployee: employeeData.addEmployee,
                updateEmployee: employeeData.updateEmployee,
                toggleEmployeeStatus: employeeData.toggleStatus,
                refreshEmployees: employeeData.refresh,
                departments: departmentData.departments,
                departmentsLoading: departmentData.loading,
                departmentsError: departmentData.error,
                addDepartment: departmentData.addDepartment,
                removeDepartment: departmentData.removeDepartment,
                refreshDepartments: departmentData.refresh,
                designations: designationData.designations,
                designationsLoading: designationData.loading,
                designationsError: designationData.error,
                addDesignation: designationData.addDesignation,
                removeDesignation: designationData.removeDesignation,
                refreshDesignations: designationData.refresh,
            }}
        >
            {children}
        </AppDataContext.Provider>
    );
}

export function useAppData() {
    const context = useContext(AppDataContext);
    if (!context) throw new Error('useAppData must be used within AppDataProvider');
    return context;
}

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const allowedRoles = new Set(['EMPLOYEE', 'MANAGER', 'HR', 'SUPER_ADMIN']);

type CreateAccountRequest = {
    employee_id: string;
    email: string;
    name: string;
    password: string;
    role: 'EMPLOYEE' | 'MANAGER' | 'HR' | 'SUPER_ADMIN';
};

function json(body: Record<string, unknown>, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}

Deno.serve(async (request) => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (request.method !== 'POST') {
        console.error('[create-employee-account] Rejected request method', request.method);
        return json({ error: 'Method not allowed' }, 405);
    }

    const authorization = request.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) {
        console.error('[create-employee-account] Missing authorization header');
        return json({ error: 'Missing authorization' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
        console.error('[create-employee-account] Server configuration is incomplete');
        return json({ error: 'Server configuration is incomplete' }, 500);
    }

    const token = authorization.slice('Bearer '.length);
    const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authorization } },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !authData.user) {
        console.error('[create-employee-account] Invalid session', authError?.message);
        return json({ error: 'Invalid session' }, 401);
    }

    const { data: employeeActive, error: statusError } = await userClient.rpc('is_current_employee_active');
    if (statusError || employeeActive !== true) {
        return json({ error: 'Your account is inactive.' }, 403);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: callerProfile, error: callerError } = await adminClient
        .from('profiles')
        .select('role, login_enabled')
        .eq('id', authData.user.id)
        .single();
    if (callerError || !callerProfile || !callerProfile.login_enabled || !['HR', 'SUPER_ADMIN'].includes(callerProfile.role)) {
        console.error('[create-employee-account] Caller is not authorized', callerError?.message);
        return json({ error: 'Only HR or Super Admin users can create employee accounts' }, 403);
    }

    let payload: CreateAccountRequest;
    try {
        payload = await request.json();
    } catch (error) {
        console.error('[create-employee-account] Invalid request body', error);
        return json({ error: 'Invalid request body' }, 400);
    }
    if (!payload.employee_id || !payload.email || !payload.name || !payload.password || !allowedRoles.has(payload.role)) {
        console.error('[create-employee-account] Required account fields are missing or invalid');
        return json({ error: 'employee_id, email, name, password, and a valid role are required' }, 400);
    }
    if (payload.role === 'SUPER_ADMIN' && callerProfile.role !== 'SUPER_ADMIN') {
        console.error('[create-employee-account] Caller is not authorized to assign SUPER_ADMIN');
        return json({ error: 'Only a Super Admin can create another Super Admin account' }, 403);
    }
    if (payload.password.length < 8) {
        console.error('[create-employee-account] Password is too short');
        return json({ error: 'Password must be at least 8 characters' }, 400);
    }

    const { data: employee, error: employeeError } = await adminClient
        .from('employees')
        .select('id, email, name')
        .eq('id', payload.employee_id)
        .single();
    if (employeeError || !employee) {
        console.error('[create-employee-account] Employee record was not found', employeeError?.message);
        return json({ error: 'Employee record was not found' }, 404);
    }
    if (employee.email.toLowerCase() !== payload.email.toLowerCase()) {
        console.error('[create-employee-account] Account email does not match employee record');
        return json({ error: 'Account email does not match the employee record' }, 400);
    }

    const { data: createdUser, error: createError } = await adminClient.auth.admin.createUser({
        email: payload.email,
        password: payload.password,
        email_confirm: true,
        user_metadata: { name: payload.name },
    });
    if (createError || !createdUser.user) {
        console.error('[create-employee-account] Auth account creation failed', createError?.message);
        return json({ error: createError?.message ?? 'Could not create authentication account' }, 400);
    }

    const { error: profileError } = await adminClient
        .from('profiles')
        .update({ name: payload.name, email: payload.email, role: payload.role, employee_id: payload.employee_id, login_enabled: true })
        .eq('id', createdUser.user.id);
    if (profileError) {
        console.error('[create-employee-account] Profile linking failed', profileError.message);
        await adminClient.auth.admin.deleteUser(createdUser.user.id);
        return json({ error: `Could not link account to employee profile: ${profileError.message}` }, 500);
    }

    return json({ user_id: createdUser.user.id, employee_id: payload.employee_id, role: payload.role, login_enabled: true }, 201);
});

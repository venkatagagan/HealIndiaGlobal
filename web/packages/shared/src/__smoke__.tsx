// TEMPORARY compile-only smoke test of the package entry points (deleted after verification).
import '@hig/shared/theme.css';
import { useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { LayoutDashboard, Users } from 'lucide-react';
import * as Root from '@hig/shared';
import { authApi, STAFF_ROLES, type CaseOut, type Page, type UserOut } from '@hig/shared/api';
import type { TokenOut } from '@hig/shared/api/types';
import {
  AuthProvider,
  LoginPage,
  RegisterForm,
  RequireAuth,
  isMfaRequired,
  publicLoginUrl,
  useAuth,
  type AuthStatus,
} from '@hig/shared/auth';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  Chip,
  ConfirmDialog,
  DataTable,
  DateText,
  Drawer,
  EmptyState,
  ErrorState,
  FileUpload,
  FormField,
  Input,
  Modal,
  MoneyText,
  PageHeader,
  Pagination,
  ProgressBar,
  SearchInput,
  Select,
  Skeleton,
  Spinner,
  StatCard,
  StatusBadge,
  Stepper,
  Switch,
  Table,
  Tabs,
  Textarea,
  Toaster,
  Avatar,
  toast,
  type DataTableColumn,
  AmountRangeFilter,
  DateCell,
  DateRangeFilter,
  ExportButton,
  FilterBar,
  IdCell,
  MoneyCell,
  MultiSelectFilter,
  PersonCell,
  QuickFilters,
  SelectFilter,
  StatusBadgeCell,
  ToggleFilter,
  exportCsv,
} from '@hig/shared/ui';
import { AuthLayout, PortalLayout, PublicLayout, type NavItem } from '@hig/shared/layout';
import {
  cn,
  createQueryClient,
  formatMoney,
  addTranslations,
  initI18n,
  useDocumentTitle,
  useRealtime,
  useRealtimeEvent,
  useTheme,
  fetchAllPages,
  filterParam,
  matchesSearch,
  useTableState,
  useUrlFilters,
} from '@hig/shared/lib';

const queryClient = createQueryClient();
const status: AuthStatus = 'loading';
void status;
void Root.formatMoney(100, 'USD');
void Root.useAuth;
void publicLoginUrl();
initI18n();
addTranslations('app', { hello: 'Hello' });

function Session() {
  const auth = useAuth();
  const { isDark } = useTheme();
  useDocumentTitle('Smoke');
  const { status: ws, subscribe } = useRealtime();
  useEffect(() => subscribe('message.created', (message) => void message.body), [subscribe]);
  useRealtimeEvent(['booking.updated', 'case.updated'], (data) => void data);
  const login = async () => {
    try {
      const u: UserOut = await auth.login('a@b.co', 'secret', '123456');
      await auth.login({ email: 'a@b.co', password: 'x', otp_code: '123456' });
      void u;
    } catch (e) {
      if (isMfaRequired(e)) toast.error('mfa');
    }
  };
  const token: TokenOut | null = null;
  void token;
  return (
    <div className={cn('p-4', isDark && 'dark')}>
      {ws} {auth.status} {auth.user?.full_name} {String(auth.hasRole(STAFF_ROLES))} {String(auth.hasRole('agent', 'hospital'))}
      <Button onClick={() => void login()} loading={false} variant="danger" size="sm" leftIcon={<Users />}>
        Go
      </Button>
      <Button onClick={() => void auth.logout({ redirectTo: null })}>Out</Button>
      <Button onClick={() => void auth.reloadUser()}>Reload</Button>
    </div>
  );
}

const columns: DataTableColumn<CaseOut>[] = [
  { key: 'case_number', header: 'Case', sortable: true },
  { key: 'status', header: 'Status', cell: (c) => <StatusBadge status={c.status} kind="case" /> },
  { key: 'created_at', header: 'Created', cell: (c) => <DateText value={c.created_at} format="relative" />, align: 'end' },
];

const SMOKE_FILTERS = {
  q: filterParam.text(),
  status: filterParam.list(['enquiry', 'quoted'] as const),
  hospital_id: filterParam.text(),
  from: filterParam.date(),
  to: filterParam.date(),
  min: filterParam.number(),
  emergency: filterParam.boolean(),
  field: filterParam.oneOf(['created', 'updated'] as const, 'created'),
};

const richColumns: DataTableColumn<CaseOut>[] = [
  { key: 'case', header: 'Case', sticky: true, sortable: true, sortKey: 'case_number', cell: (c) => <IdCell value={c.case_number} /> },
  { key: 'patient', header: 'Patient', mobile: 'primary', cell: (c) => <PersonCell name={c.patient.full_name} secondary={c.patient.nationality} /> },
  { key: 'status', header: 'Status', mobile: 'badge', cell: (c) => <StatusBadgeCell status={c.status} kind="case" /> },
  { key: 'quote', header: 'Quote', align: 'end', cell: (c) => <MoneyCell minor={c.latest_quote?.total_minor} currency={c.latest_quote?.currency} /> },
  { key: 'updated', header: 'Updated', sortable: true, sortKey: 'updated_at', sortDescFirst: true, defaultHidden: true, cell: (c) => <DateCell value={c.updated_at} display="relative" /> },
];

function TableKit({ page }: { page: Page<CaseOut> }) {
  const table = useTableState({ filters: SMOKE_FILTERS, defaultSort: '-updated_at', sortKeys: ['updated_at', 'case_number'] });
  const only = useUrlFilters({ tab: filterParam.text() }, { prefix: 'x_' });
  const f = table.filters;
  const status: ('enquiry' | 'quoted')[] = f.status;
  void status;
  void only.filters.tab;
  void table.params.page;
  void fetchAllPages(async () => ({ items: page.items, pages: 1 }));
  void page.items.filter(matchesSearch(f.q, (c) => [c.case_number, c.patient.full_name]));
  return (
    <DataTable
      id="smoke.cases"
      table={table}
      total={page.total}
      columns={richColumns}
      rows={page.items}
      rowHref={(c) => `/cases/${c.id}`}
      selectable
      bulkActions={(rows, clear) => <Button onClick={() => { exportCsv(rows, richColumns, 'x'); clear(); }}>Export</Button>}
      header={<QuickFilters items={[{ value: '', label: 'All', count: 3 }, { value: 'quoted', label: 'Quoted' }]} value="" onChange={() => undefined} />}
      toolbar={
        <FilterBar
          search={{ value: f.q, onChange: (q) => table.setFilter('q', q) }}
          onReset={table.resetFilters}
          resultCount={page.total}
          actions={<ExportButton filename="cases" columns={richColumns} rows={page.items} fetchAll={async () => page.items} total={page.total} />}
          more={<ToggleFilter label="Emergency" pressed={f.emergency === true} onChange={(v) => table.setFilter('emergency', v || undefined)} />}
        >
          <MultiSelectFilter label="Status" value={f.status} onChange={(v) => table.setFilter('status', v)} options={[{ value: 'quoted', label: 'Quoted', count: 2 }]} />
          <SelectFilter label="Hospital" value={f.hospital_id} onChange={(v) => table.setFilter('hospital_id', v)} options={[{ value: 'h1', label: 'H1' }]} />
          <DateRangeFilter
            label="Date"
            value={{ from: f.from, to: f.to }}
            onChange={(r) => table.setFilters(r)}
            fieldOptions={[{ value: 'created', label: 'Created' }]}
            field={f.field || 'created'}
            onFieldChange={(field) => table.setFilter('field', field)}
          />
          <AmountRangeFilter label="Amount" currency="USD" value={{ min: f.min }} onChange={(r) => table.setFilter('min', r.min)} />
        </FilterBar>
      }
    />
  );
}

function Kitchen({ page }: { page: Page<CaseOut> }) {
  return (
    <>
      <PageHeader title="Cases" description="All" actions={<Button>New</Button>} breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Cases' }]} />
      <DataTable
        columns={columns}
        rows={page.items}
        pagination={{ page: page.page, pages: page.pages, pageSize: page.page_size, total: page.total, onPageChange: () => undefined }}
        onRowClick={(c) => void c.id}
        loading={false}
        error={null}
      />
      <TableKit page={page} />
      <Pagination page={1} pages={3} onChange={() => undefined} />
      <Card>
        <CardHeader title="T" actions={<Badge tone="green">x</Badge>} />
        <CardBody>
          <FormField label="Email" error="bad" hint="h">
            <Input type="email" />
          </FormField>
          <FormField label="Notes">
            <Textarea />
          </FormField>
          <Select options={[{ value: 'a', label: 'A' }]} placeholder="Pick" />
          <Checkbox label="Agree" />
          <Switch checked onCheckedChange={() => undefined} label="On" />
          <SearchInput value="" onChange={() => undefined} onSearch={() => undefined} />
          <FileUpload onFiles={(files) => void files} multiple />
          <Chip selected onClick={() => undefined}>
            c
          </Chip>
          <MoneyText minor={250000} currency="USD" compact />
          <ProgressBar value={40} label="Progress" showValue />
          <Stepper steps={['One', { label: 'Two' }]} current={1} />
          <StatCard label="GMV" value={formatMoney(1, 'INR')} icon={<Users />} tone="violet" trend={{ value: 12.5 }} />
          <Tabs tabs={[{ value: 'a', label: 'A', count: 2 }]} value="a" onChange={(v) => void v} />
          <Avatar name="Asha Rao" />
          <Skeleton lines={3} />
          <Spinner />
          <EmptyState title="None" />
          <ErrorState error={new Error('x')} onRetry={() => undefined} />
          <Table>
            <tbody />
          </Table>
        </CardBody>
      </Card>
      <Modal open onClose={() => undefined} title="M" footer={<Button>OK</Button>}>
        body
      </Modal>
      <Drawer open={false} onClose={() => undefined} title="D" width="lg" />
      <ConfirmDialog open={false} onClose={() => undefined} onConfirm={async () => authApi.me()} tone="danger" message="Sure?" />
    </>
  );
}

const nav: NavItem[] = [
  { label: 'Dashboard', to: '/', icon: LayoutDashboard },
  { label: 'Users', to: '/users', icon: <Users className="size-5" />, roles: ['admin', 'super_admin'], children: [{ label: 'Staff', to: '/users/staff' }] },
];

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage door="staff" title="Admin" onSuccessPath="/" /> },
  { path: '/register', element: <AuthLayout title="Join"><RegisterForm roles={['agent']} /></AuthLayout> },
  { path: '/public', element: <PublicLayout />, children: [{ index: true, element: <div /> }] },
  {
    element: (
      <RequireAuth roles={STAFF_ROLES} portalUrls={{ agent: 'http://localhost:5174/agent/' }}>
        <PortalLayout brand={<b>HIG</b>} nav={nav} topbarExtra={<span />} />
      </RequireAuth>
    ),
    children: [{ index: true, element: <Session /> }],
  },
]);

export function SmokeApp({ page }: { page: Page<CaseOut> }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider door="staff" loginUrl="/login">
        <RouterProvider router={router} />
        <Kitchen page={page} />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}

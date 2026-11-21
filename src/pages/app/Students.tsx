import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Papa from 'papaparse';
import { Archive, ArchiveRestore, CalendarDays, Download, FileUp, Pencil, Search, Trash2, UserCheck, UserPlus, Users } from 'lucide-react';
import { BarButton, BulkBar, RowBox, SelectAllBox, exportSelected, useSelection } from '@/components/domain/Bulk';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { rpc, supabase, errorMessage } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useAction } from '@/lib/queries';
import type { Student } from '@/lib/types';
import { downloadCsv, cn } from '@/lib/utils';
import { dhakaToday } from '@/lib/format';
import { useI18n } from '@/i18n/I18nProvider';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { EmptyState, PageHeader, PageSkeleton, Segmented } from '@/components/ui/misc';
import { useLookups } from '@/components/domain/lookups';

export default function Students() {
  const { t, date, num } = useI18n();
  const { can } = useAuth();
  const L = useLookups();
  const [bulk, setBulk] = useState<null | 'delete' | 'assign' | 'joined'>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'active' | 'archived' | 'all'>('active');
  const [group, setGroup] = useState('');
  const [collector, setCollector] = useState('');
  const [editing, setEditing] = useState<Student | 'new' | null>(null);
  const [importing, setImporting] = useState(false);
  const [archiving, setArchiving] = useState<Student | null>(null);
  const qc = useQueryClient();

  const groups = useMemo(() => Array.from(new Set(L.students.flatMap((s) => [s.class_name, s.group_name]).filter(Boolean) as string[])).sort(), [L.students]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return L.students
      .filter((x) => status === 'all' || x.status === status)
      .filter((x) => !group || x.class_name === group || x.group_name === group)
      .filter((x) => !collector || (collector === '-' ? !L.collectorOf.get(x.id) : L.collectorOf.get(x.id) === collector))
      .filter((x) => !s || x.name.toLowerCase().includes(s) || x.roll.toLowerCase().includes(s) || (x.phone ?? '').includes(s))
      .sort((a, b) => a.roll.localeCompare(b.roll, undefined, { numeric: true }));
  }, [L.students, L.collectorOf, q, status, group, collector]);

  const toggleArchive = useAction(
    async (s: Student) => {
      const { error } = await supabase.from('students').update({ status: s.status === 'active' ? 'archived' : 'active' }).eq('id', s.id);
      if (error) throw new Error(errorMessage(error));
    },
    { success: t('saved'), extraKeys: ['students'] },
  );

  const sel = useSelection(list.map((x) => x.id));
  const chosen = list.filter((x) => sel.has(x.id));
  const removeMany = useAction((reason: string) => rpc<{ archived: number; deleted: number; skipped: number }>('bulk_remove_students', { p_ids: sel.selected, p_reason: reason }), { extraKeys: ['students'] });
  const restoreMany = useAction(() => rpc<number>('bulk_restore_students', { p_ids: sel.selected }), { extraKeys: ['students'] });

  if (L.loading) return <PageSkeleton />;
  const collectors = L.profiles.filter((p) => p.role === 'collector');
  const isAdmin = can('admin');

  return (
    <div>
      <PageHeader
        title={t('navStudents')}
        actions={
          <>
            {can('admin', 'treasurer', 'auditor') && (
              <Button variant="secondary" onClick={() => downloadCsv('students.csv', [
                ['roll', 'name', 'phone', 'email', 'birthdate', 'class', 'group', 'status', 'collector'],
                ...list.map((s) => [s.roll, s.name, s.phone, s.email, s.birthdate, s.class_name, s.group_name, s.status, L.personName(L.collectorOf.get(s.id))]),
              ])}><Download />{t('exportCsv')}</Button>
            )}
            {can('admin') && <Button variant="secondary" onClick={() => setImporting(true)}><FileUp />{t('importCsv')}</Button>}
            {can('admin') && <Button onClick={() => setEditing('new')}><UserPlus />{t('addStudent')}</Button>}
          </>
        }
      />
      <Card>
        <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center">
          <div className="relative lg:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('pickStudent')} className="pl-9" />
          </div>
          <Segmented value={status} onChange={setStatus} options={[
            { value: 'active', label: t('st_active'), count: L.students.filter((s) => s.status === 'active').length },
            { value: 'archived', label: t('st_archived'), count: L.students.filter((s) => s.status === 'archived').length },
            { value: 'all', label: t('all') },
          ]} />
          <div className="grid grid-cols-2 gap-3 lg:ml-auto lg:flex">
            {groups.length > 0 && (
              <Select value={group} onChange={(e) => setGroup(e.target.value)} aria-label={t('groupName')}>
                <option value="">{t('groupName')}: {t('all')}</option>
                {groups.map((g) => <option key={g}>{g}</option>)}
              </Select>
            )}
            {collectors.length > 0 && (
              <Select value={collector} onChange={(e) => setCollector(e.target.value)} aria-label={t('collector')}>
                <option value="">{t('collector')}: {t('all')}</option>
                <option value="-">{t('unassigned')}</option>
                {collectors.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
              </Select>
            )}
          </div>
        </div>
        {list.length === 0 ? (
          <EmptyState icon={<Users />} title={L.students.length ? t('noResults') : t('noStudents')} action={!L.students.length && can('admin') ? <Button onClick={() => setImporting(true)}><FileUp />{t('importCsv')}</Button> : undefined} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead className="bg-sunken/60 text-left text-[12px] text-ink-3">
                <tr>
                  <th className="w-10 py-2.5 pl-4"><SelectAllBox s={sel} visible={list.map((x) => x.id)} /></th>
                  <th className="px-4 py-2.5 font-medium">{t('roll')}</th>
                  <th className="px-4 py-2.5 font-medium">{t('name')}</th>
                  <th className="hidden px-4 py-2.5 font-medium md:table-cell">{t('phone')}</th>
                  <th className="hidden px-4 py-2.5 font-medium lg:table-cell">{t('birthdate')}</th>
                  <th className="hidden px-4 py-2.5 font-medium sm:table-cell">{t('collector')}</th>
                  <th className="px-4 py-2.5 font-medium">{t('status')}</th>
                  {can('admin') && <th className="px-4 py-2.5" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {list.map((s) => (
                  <tr key={s.id} className={cn('hover:bg-sunken/40', sel.has(s.id) && 'bg-brand-soft/60 hover:bg-brand-soft')}>
                    <td className="w-10 py-2.5 pl-4"><RowBox s={sel} id={s.id} label={s.name} /></td>
                    <td className="num px-4 py-2.5 text-ink-3">{s.roll}</td>
                    <td className="px-4 py-2.5">
                      <Link to={`/app/students/${s.id}`} className="font-medium hover:underline">{s.name}</Link>
                      {(s.class_name || s.group_name) && <div className="text-[12px] text-ink-3">{[s.class_name, s.group_name].filter(Boolean).join(' · ')}</div>}
                    </td>
                    <td className="num hidden px-4 py-2.5 text-ink-2 md:table-cell">{s.phone || '—'}</td>
                    <td className="hidden px-4 py-2.5 text-ink-2 lg:table-cell">{s.birthdate ? date(s.birthdate) : <span className="text-ink-3">—</span>}</td>
                    <td className="hidden px-4 py-2.5 sm:table-cell">{L.collectorOf.get(s.id) ? L.personName(L.collectorOf.get(s.id)) : <Badge tone="warn">{t('unassigned')}</Badge>}</td>
                    <td className="px-4 py-2.5"><StatusBadge status={s.status} /></td>
                    {can('admin') && (
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-1">
                          <Button size="icon-sm" variant="ghost" aria-label={t('edit')} onClick={() => setEditing(s)}><Pencil /></Button>
                          <Button size="icon-sm" variant="ghost" aria-label={s.status === 'active' ? t('archive') : t('restore')} onClick={() => setArchiving(s)}>
                            {s.status === 'active' ? <Archive /> : <ArchiveRestore />}
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <BulkBar s={sel}>
        <BarButton onClick={() => exportSelected('students-selected.csv', chosen, [
          ['roll', (x) => x.roll], ['name', (x) => x.name], ['phone', (x) => x.phone], ['email', (x) => x.email], ['birthdate', (x) => x.birthdate],
          ['joined', (x) => x.joined_on], ['class', (x) => x.class_name], ['group', (x) => x.group_name], ['status', (x) => x.status],
          ['collector', (x) => L.personName(L.collectorOf.get(x.id))],
        ])}><Download />{t('csvSelected')}</BarButton>
        {isAdmin && <BarButton onClick={() => setBulk('assign')}><UserCheck />{t('assignSelected')}</BarButton>}
        {isAdmin && <BarButton onClick={() => setBulk('joined')}><CalendarDays />{t('setJoinedSelected')}</BarButton>}
        {isAdmin && chosen.some((x) => x.status === 'archived') && (
          <BarButton onClick={async () => {
            try { const n = await restoreMany.mutateAsync(undefined); toast.success(t('studentsRestored', { n: num(n) })); sel.clear(); } catch { /* toast shown */ }
          }}><ArchiveRestore />{t('restoreSelected')}</BarButton>
        )}
        {isAdmin && <BarButton danger onClick={() => setBulk('delete')}><Trash2 />{t('bulkDelete')}</BarButton>}
      </BulkBar>
      <ConfirmDialog
        open={bulk === 'delete'}
        onOpenChange={(o) => !o && setBulk(null)}
        title={t('removeStudentsTitle', { n: num(sel.count) })}
        body={t('removeStudentsBody')}
        confirmLabel={t('bulkDelete')}
        danger
        reasonLabel={t('bulkReason')}
        minReason={3}
        loading={removeMany.isPending}
        onConfirm={async (reason) => {
          try {
            const r = await removeMany.mutateAsync(reason);
            toast.success(t('studentsRemoved', { a: num(r.archived), d: num(r.deleted) }));
            if (r.skipped) toast.message(t('bulkSkippedN', { n: num(r.skipped) }));
            sel.clear(); setBulk(null);
          } catch { /* toast shown */ }
        }}
      />
      <AssignManyDialog open={bulk === 'assign'} onClose={() => setBulk(null)} ids={sel.selected} collectors={collectors} onDone={sel.clear} />
      <JoinedManyDialog open={bulk === 'joined'} onClose={() => setBulk(null)} ids={sel.selected} onDone={sel.clear} />

      <StudentDialog student={editing} onClose={() => setEditing(null)} onSaved={() => qc.invalidateQueries({ queryKey: ['students'] })} />
      <ImportDialog open={importing} onOpenChange={setImporting} existing={L.students} />
      <ConfirmDialog
        open={!!archiving}
        onOpenChange={(o) => !o && setArchiving(null)}
        title={archiving?.status === 'active' ? t('archive') : t('restore')}
        body={<><b className="text-ink">{archiving?.name}</b><p className="mt-1">{t('archiveConfirm')}</p></>}
        confirmLabel={archiving?.status === 'active' ? t('archive') : t('restore')}
        loading={toggleArchive.isPending}
        onConfirm={async () => { if (archiving) await toggleArchive.mutateAsync(archiving).catch(() => {}); setArchiving(null); }}
      />
    </div>
  );
}

function StudentDialog({ student, onClose, onSaved }: { student: Student | 'new' | null; onClose: () => void; onSaved: () => void }) {
  const { t, pick } = useI18n();
  const isNew = student === 'new';
  const s = student && student !== 'new' ? student : null;
  const [f, setF] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const key = student === 'new' ? 'new' : s?.id ?? '';
  const [lastKey, setLastKey] = useState('');
  if (key !== lastKey) {
    setLastKey(key);
    setErr('');
    setF({
      roll: s?.roll ?? '', name: s?.name ?? '', phone: s?.phone ?? '', email: s?.email ?? '', birthdate: s?.birthdate ?? '',
      class_name: s?.class_name ?? '', group_name: s?.group_name ?? '', notes: s?.notes ?? '', joined_on: s?.joined_on ?? dhakaToday(),
    });
  }
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    setErr('');
    if (!f.roll?.trim() || !f.name?.trim()) return setErr(pick('Roll and name are required.', 'রোল ও নাম আবশ্যক।'));
    if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) return setErr(pick('Email looks wrong.', 'ইমেইল সঠিক নয়।'));
    if (f.birthdate && f.birthdate > dhakaToday()) return setErr(pick('Date of birth cannot be in the future.', 'জন্ম তারিখ ভবিষ্যতে হতে পারে না।'));
    setSaving(true);
    const payload = {
      roll: f.roll.trim(), name: f.name.trim(), phone: f.phone.trim() || null, email: f.email.trim() || null,
      birthdate: f.birthdate || null, class_name: f.class_name.trim() || null, group_name: f.group_name.trim() || null,
      notes: f.notes.trim() || null, joined_on: f.joined_on || dhakaToday(),
    };
    const { error } = isNew ? await supabase.from('students').insert(payload) : await supabase.from('students').update(payload).eq('id', s!.id);
    setSaving(false);
    if (error) return setErr(error.code === '23505' ? pick('Another student already has this roll.', 'এই রোল অন্য শিক্ষার্থীর আছে।') : errorMessage(error));
    toast.success(t('saved'));
    onSaved();
    onClose();
  };

  return (
    <Dialog open={!!student} onOpenChange={(o) => !o && onClose()} title={isNew ? t('addStudent') : t('editStudent')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('cancel')}</Button><Button loading={saving} onClick={save}>{t('save')}</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('roll')}><Input value={f.roll ?? ''} onChange={set('roll')} className="num" /></Field>
        <Field label={t('name')}><Input value={f.name ?? ''} onChange={set('name')} /></Field>
        <Field label={t('phone')}><Input value={f.phone ?? ''} onChange={set('phone')} inputMode="tel" /></Field>
        <Field label={t('email')}><Input value={f.email ?? ''} onChange={set('email')} type="email" /></Field>
        <Field label={t('birthdate')} hint={pick('Leave empty if unknown. No date is ever guessed.', 'জানা না থাকলে খালি রাখুন।')}><Input type="date" value={f.birthdate ?? ''} onChange={set('birthdate')} max={dhakaToday()} /></Field>
        <Field label={t('joinedOn')} hint={pick('Dues start from the month they joined.', 'যোগদানের মাস থেকে চাঁদা শুরু হবে।')}><Input type="date" value={f.joined_on ?? ''} onChange={set('joined_on')} /></Field>
        <Field label={t('className')}><Input value={f.class_name ?? ''} onChange={set('class_name')} /></Field>
        <Field label={t('groupName')}><Input value={f.group_name ?? ''} onChange={set('group_name')} /></Field>
        <Field label={t('note')} className="sm:col-span-2"><Textarea rows={2} value={f.notes ?? ''} onChange={set('notes')} /></Field>
      </div>
      {err && <p className="mt-3 rounded-[8px] bg-bad-soft px-3 py-2 text-[13px] text-bad">{err}</p>}
    </Dialog>
  );
}

interface ParsedRow { line: number; roll: string; name: string; phone: string; email: string; birthdate: string; class_name: string; group_name: string; problem?: string }

function ImportDialog({ open, onOpenChange, existing }: { open: boolean; onOpenChange: (o: boolean) => void; existing: Student[] }) {
  const { t, pick, num } = useI18n();
  const qc = useQueryClient();
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const ok = rows.filter((r) => !r.problem);
  const bad = rows.filter((r) => r.problem);

  const parse = (file: File) => {
    setFileName(file.name);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, '_'),
      complete: (res) => {
        const seen = new Set<string>();
        const have = new Set(existing.map((s) => s.roll.trim().toLowerCase()));
        const out: ParsedRow[] = res.data.map((r, i) => {
          const row: ParsedRow = {
            line: i + 2,
            roll: (r.roll ?? '').trim(),
            name: (r.name ?? r.student_name ?? '').trim(),
            phone: (r.phone ?? '').trim(),
            email: (r.email ?? '').trim(),
            birthdate: (r.birthdate ?? r.date_of_birth ?? r.dob ?? '').trim(),
            class_name: (r.class ?? r.class_name ?? '').trim(),
            group_name: (r.group ?? r.group_name ?? '').trim(),
          };
          const key = row.roll.toLowerCase();
          if (!row.roll) row.problem = pick('Roll is missing', 'রোল নেই');
          else if (!row.name) row.problem = pick('Name is missing', 'নাম নেই');
          else if (row.roll.length > 30 || row.name.length > 120) row.problem = pick('Too long', 'অনেক লম্বা');
          else if (seen.has(key)) row.problem = pick('Duplicate roll in this file', 'ফাইলে একই রোল দুবার');
          else if (have.has(key)) row.problem = pick('Roll already exists (not overwritten)', 'রোল আগে থেকেই আছে (বদলানো হবে না)');
          else if (row.birthdate && !/^\d{4}-\d{2}-\d{2}$/.test(row.birthdate)) row.problem = pick('Birthdate must be YYYY-MM-DD', 'জন্ম তারিখ YYYY-MM-DD হতে হবে');
          else if (row.birthdate && (isNaN(Date.parse(row.birthdate)) || row.birthdate > dhakaToday())) row.problem = pick('Birthdate is not a real past date', 'জন্ম তারিখ সঠিক নয়');
          else if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) row.problem = pick('Email looks wrong', 'ইমেইল সঠিক নয়');
          seen.add(key);
          return row;
        });
        setRows(out);
      },
      error: (e) => toast.error(e.message),
    });
  };

  const run = async () => {
    setBusy(true);
    let added = 0;
    for (let i = 0; i < ok.length; i += 200) {
      const chunk = ok.slice(i, i + 200).map((r) => ({
        roll: r.roll, name: r.name, phone: r.phone || null, email: r.email || null, birthdate: r.birthdate || null,
        class_name: r.class_name || null, group_name: r.group_name || null,
      }));
      const { error } = await supabase.from('students').insert(chunk);
      if (error) {
        toast.error(errorMessage(error));
        break;
      }
      added += chunk.length;
    }
    setBusy(false);
    qc.invalidateQueries({ queryKey: ['students'] });
    if (added) toast.success(t('importDone', { n: added }));
    if (added === ok.length) close();
  };

  const close = () => { setRows([]); setFileName(''); onOpenChange(false); };
  const template = () => downloadCsv('students-template.csv', [['roll', 'name', 'phone', 'email', 'birthdate', 'class', 'group'], ['01', 'Abdullah Al Mamun', '01711000000', '', '2004-03-15', '', 'A']]);

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(o) : close())} title={t('importCsv')} size="lg"
      footer={<><Button variant="secondary" onClick={close}>{t('cancel')}</Button><Button disabled={!ok.length} loading={busy} onClick={run}>{t('importNow', { n: ok.length })}</Button></>}>
      <p className="text-[13px] text-ink-3">{t('csvHelp')}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-[8px] border border-line-strong px-4 text-[14px] font-medium hover:bg-sunken">
          <FileUp className="size-4" /> {fileName || t('chooseFile')}
          <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => e.target.files?.[0] && parse(e.target.files[0])} />
        </label>
        <Button variant="ghost" onClick={template}><Download />{t('downloadTemplate')}</Button>
      </div>
      {rows.length > 0 && (
        <div className="mt-5">
          <h3 className="text-[14px] font-semibold">{t('importReview')}</h3>
          <p className="mt-1 text-[13px]"><span className="text-good">{t('importReady', { n: ok.length })}</span>{bad.length > 0 && <> · <span className="text-bad">{t('importSkipped', { n: bad.length })}</span></>}</p>
          <div className="mt-3 max-h-72 overflow-auto rounded-[10px] border border-line">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 bg-sunken text-left text-ink-3"><tr><th className="px-3 py-2">#</th><th className="px-3 py-2">{t('roll')}</th><th className="px-3 py-2">{t('name')}</th><th className="px-3 py-2">{t('birthdate')}</th><th className="px-3 py-2">{t('status')}</th></tr></thead>
              <tbody className="divide-y divide-line">
                {[...bad, ...ok].map((r) => (
                  <tr key={r.line} className={cn(r.problem && 'bg-bad-soft/50')}>
                    <td className="num px-3 py-1.5 text-ink-3">{num(r.line)}</td>
                    <td className="num px-3 py-1.5">{r.roll}</td>
                    <td className="px-3 py-1.5">{r.name}</td>
                    <td className="num px-3 py-1.5">{r.birthdate || '—'}</td>
                    <td className="px-3 py-1.5">{r.problem ? <span className="text-bad">{r.problem}</span> : <span className="text-good">✓</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!ok.length && <p className="mt-2 text-[13px] text-bad">{t('importNothing')}</p>}
        </div>
      )}
    </Dialog>
  );
}

function AssignManyDialog({ open, onClose, ids, collectors, onDone }: { open: boolean; onClose: () => void; ids: string[]; collectors: { id: string; full_name: string | null; email: string | null }[]; onDone: () => void }) {
  const { t, num } = useI18n();
  const [who, setWho] = useState('');
  const save = useAction(() => rpc<number>('assign_students', { p_collector: who || null, p_students: ids }), { extraKeys: ['students', 'assignments'] });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title={t('assignManyTitle', { n: num(ids.length) })} size="sm"
      footer={<>
        <Button variant="secondary" onClick={onClose}>{t('cancel')}</Button>
        <Button loading={save.isPending} onClick={async () => {
          try { await save.mutateAsync(undefined); toast.success(t('studentsAssigned', { n: num(ids.length) })); onDone(); onClose(); } catch { /* toast shown */ }
        }}>{t('save')}</Button>
      </>}>
      <Field label={t('collector')}>
        <Select value={who} onChange={(e) => setWho(e.target.value)}>
          <option value="">{t('assignNone')}</option>
          {collectors.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
        </Select>
      </Field>
    </Dialog>
  );
}

function JoinedManyDialog({ open, onClose, ids, onDone }: { open: boolean; onClose: () => void; ids: string[]; onDone: () => void }) {
  const { t, num } = useI18n();
  const [d, setD] = useState('');
  const save = useAction(async () => {
    const { error } = await supabase.from('students').update({ joined_on: d }).in('id', ids);
    if (error) throw new Error(errorMessage(error));
  }, { success: t('saved'), extraKeys: ['students'] });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title={t('setJoinedTitle', { n: num(ids.length) })} description={t('setJoinedBody')} size="sm"
      footer={<>
        <Button variant="secondary" onClick={onClose}>{t('cancel')}</Button>
        <Button disabled={!d} loading={save.isPending} onClick={async () => {
          try { await save.mutateAsync(undefined); onDone(); onClose(); } catch { /* toast shown */ }
        }}>{t('save')}</Button>
      </>}>
      <Field label={t('setJoinedSelected')}><Input type="date" value={d} max={dhakaToday()} onChange={(e) => setD(e.target.value)} /></Field>
    </Dialog>
  );
}

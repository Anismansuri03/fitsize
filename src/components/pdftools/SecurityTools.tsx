import { useState } from 'react';
import { qpdf, QpdfError } from '../../lib/pdfops/qpdf';
import { decryptArgs, encryptArgs } from '../../lib/pdfops/qpdfArgs';
import { AdvancedToggle, CheckField, Notice } from '../ui';
import Workbench from './Workbench';
import { base, readBytes } from './shared';

function randomPassword(): string {
  const a = new Uint8Array(18);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
}

export function ProtectPdfTool() {
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [print, setPrint] = useState(true);
  const [copy, setCopy] = useState(true);
  const [edit, setEdit] = useState(true);

  return (
    <Workbench
      countPages={false}
      dropTitle="Drop your PDF here"
      dropHint="Then choose a password."
      action={() => 'Protect PDF'}
      zipName="protected.zip"
      onCancel={() => qpdf.terminate()}
      problem={() => (pw.length < 4 ? 'Choose a password with at least 4 characters. Longer is safer.' : pw !== confirm ? 'The two passwords don’t match yet.' : null)}
      options={() => (
        <div className="stack">
          <div className="field">
            <label className="field__label" htmlFor="pw">Password</label>
            <input id="pw" className="input" type={show ? 'text' : 'password'} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="pw2">Type it again</label>
            <input id="pw2" className="input" type={show ? 'text' : 'password'} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" aria-invalid={confirm !== '' && pw !== confirm ? true : undefined} />
          </div>
          <label className="check check--plain"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />Show the password</label>
          <Notice><span><strong>Write your password down.</strong> We can’t recover it, and nobody can open the file without it.</span></Notice>
          <AdvancedToggle checked={advanced} onChange={setAdvanced}>
            <p className="field__help">Choose what people are allowed to do once they have opened the file.</p>
            <CheckField checked={print} onChange={setPrint}>Allow printing</CheckField>
            <CheckField checked={copy} onChange={setCopy}>Allow copying text</CheckField>
            <CheckField checked={edit} onChange={setEdit}>Allow editing</CheckField>
            <p className="field__help">These limits are respected by most PDF apps. If you set any, keep an unprotected copy, because you won’t be able to change them later.</p>
          </AdvancedToggle>
        </div>
      )}
      process={async (items, { signal, report }) => {
        report({ note: 'Locking your PDF…' });
        await qpdf.load([await readBytes(items[0].file)], { signal });
        const allowed = advanced ? { print, copy, edit } : { print: true, copy: true, edit: true };
        const restricted = !allowed.print || !allowed.copy || !allowed.edit;
        const r = await qpdf.run(encryptArgs(pw, restricted ? randomPassword() : pw, allowed), { signal });
        return [{ name: `${base(items[0].file)}-protected.pdf`, bytes: r.files[0].bytes }];
      }}
    />
  );
}

export function UnlockPdfTool() {
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);

  return (
    <Workbench
      countPages={false}
      dropTitle="Drop your locked PDF here"
      dropHint="You need to know the password, or the file must only have editing limits."
      action={() => 'Unlock PDF'}
      zipName="unlocked.zip"
      onCancel={() => qpdf.terminate()}
      options={() => (
        <div className="stack">
          <div className="field">
            <label className="field__label" htmlFor="pw">Password (if the file asks for one to open)</label>
            <input id="pw" className="input" type={show ? 'text' : 'password'} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="off" placeholder="Leave empty if it opens without one" />
          </div>
          <label className="check check--plain"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />Show the password</label>
          <p className="field__help">This removes a password you already know. It can’t work out a forgotten one. Only unlock files you have the right to open.</p>
        </div>
      )}
      process={async (items, { signal, report }) => {
        report({ note: 'Unlocking…' });
        await qpdf.load([await readBytes(items[0].file)], { signal });
        try {
          const r = await qpdf.run(decryptArgs(pw), { signal });
          return [{ name: `${base(items[0].file)}-unlocked.pdf`, bytes: r.files[0].bytes }];
        } catch (e) {
          if (e instanceof QpdfError && e.kind === 'password') throw new Error(pw ? 'That password didn’t work. Check it and try again.' : 'This PDF needs a password to open. Type it in the box above.');
          throw e;
        }
      }}
    />
  );
}

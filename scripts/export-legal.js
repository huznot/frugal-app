// Generates docs/privacy-policy.html and docs/terms.html from the same source the app
// uses (src/legal/*.json). Host the docs/ folder (e.g. GitHub Pages) and paste the
// privacy policy URL into Google Play Console → App content → Privacy policy.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const business = require(path.join(root, 'src/legal/business.json'));
const docs = require(path.join(root, 'src/legal/documents.json'));

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fill = (s) => esc(s.replace(/\{\{(\w+)\}\}/g, (_, k) => String(business[k] ?? '')));

function page(key, file) {
  const d = docs[key];
  const sections = d.sections
    .map(
      (s) => `<section><h2>${fill(s.heading)}</h2>
${(s.body || []).map((p) => `<p>${fill(p)}</p>`).join('\n')}
${s.bullets ? `<ul>${s.bullets.map((b) => `<li>${fill(b)}</li>`).join('')}</ul>` : ''}
${(s.after || []).map((p) => `<p>${fill(p)}</p>`).join('\n')}</section>`,
    )
    .join('\n');
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(d.title)} — ${esc(business.appName)}</title>
<style>
:root{--bg:#FBF6EC;--fg:#1C1B1F;--muted:#6E6A62;--accent:#FF5A45}
@media (prefers-color-scheme:dark){:root{--bg:#141311;--fg:#F6F1E7;--muted:#ABA497}}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
main{max-width:760px;margin:0 auto;padding:40px 20px 80px}
h1{font-size:2.2rem;margin:0 0 4px;letter-spacing:-.02em}h2{font-size:1.15rem;margin:28px 0 6px}
p,li{color:var(--muted)}.eff{color:var(--accent);font-weight:700;text-transform:uppercase;font-size:.8rem;letter-spacing:.08em}
</style></head><body><main>
<h1>${esc(d.title)}</h1>${key !== 'licenses' ? `<p class="eff">Effective ${esc(business.effectiveDate)}</p>` : ''}
<p>${fill(d.intro)}</p>
${sections}
</main></body></html>
`;
  fs.writeFileSync(path.join(root, 'docs', file), html);
  console.log('wrote docs/' + file);
}

page('privacy', 'privacy-policy.html');
page('terms', 'terms.html');
page('licenses', 'licenses.html');
fs.writeFileSync(
  path.join(root, 'docs', 'index.html'),
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(business.appName)}</title>
<style>body{font:16px/1.6 system-ui,sans-serif;max-width:640px;margin:60px auto;padding:0 20px}</style>
<h1>${esc(business.appName)}</h1><ul><li><a href="privacy-policy.html">Privacy Policy</a></li><li><a href="terms.html">Terms of Service</a></li><li><a href="licenses.html">Data sources &amp; licences</a></li></ul>
<p>Contact: <a href="mailto:${esc(business.supportEmail)}">${esc(business.supportEmail)}</a></p>
<h2>Delete your data</h2><p>${esc(business.appName)} has no accounts and stores your data only on your device. Open the app → Settings → Delete all my data, or uninstall the app.</p>
`,
);
console.log('wrote docs/index.html');

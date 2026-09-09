import { mkdirSync, writeFileSync } from 'node:fs';
import { guides } from '../web/guides.mjs';
const directory = 'docs/guides';
mkdirSync(directory, { recursive: true });
for (const [slug, guide] of Object.entries(guides)) {
  let md = `# ${guide.title}\n\n${guide.description}\n\n`;
  for (const section of guide.sections) {
    md += `<a id="${section.id}"></a>\n\n## ${section.title}\n\n`;
    for (const paragraph of section.paragraphs || []) md += `${paragraph}\n\n`;
    if (section.steps) md += section.steps.map((s, i) => `${i + 1}. ${s}`).join('\n') + '\n\n';
    if (section.bullets) md += section.bullets.map(s => `- ${s}`).join('\n') + '\n\n';
    if (section.code) md += '```sh\n' + section.code + '\n```\n\n';
    if (section.note) md += `> ${section.note}\n\n`;
    for (const link of section.links || []) {
      const [path, fragment] = link.url.split('#');
      const target = path.startsWith('/docs/') ? path.replace('/docs/', './') + '.md' + (fragment ? `#${fragment}` : '') : link.url;
      md += `- [${link.label}](${target})\n`;
    }
    if (section.links) md += '\n';
  }
  md += 'Instructions reviewed September 9, 2026. Platform screens may change.\n\nGenerated from `web/guides.mjs`, the same content shown in the public help center.\n';
  writeFileSync(`${directory}/${slug}.md`, md);
}
writeFileSync(`${directory}/README.md`, '# Afterword user guides\n\n' + Object.entries(guides).map(([id, guide]) => `- [${guide.title}](./${id}.md)`).join('\n') + '\n\nThese guides also ship inside the companion download and appear at `/docs` in the app. Edit `web/guides.mjs` and run `npm run docs` to update all copies.\n');
console.log(`Generated ${Object.keys(guides).length} user guides.`);

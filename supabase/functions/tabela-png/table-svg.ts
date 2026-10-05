// Monta o SVG de uma tabela no estilo Excel (cabeçalho azul, linhas zebradas,
// total em destaque). Sem dependências: usado pela função tabela-png.

export type TableData = {
  t: string; // título
  s?: string; // subtítulo
  h: string[]; // cabeçalho
  r: { c: string[]; k?: "total"; x?: (string | null)[] }[]; // linhas; x = cor do texto por célula
  f?: string; // rodapé
};

const W_FIRST = 210;
const W_COL = 168;
const ROW_H = 46;
const PAD = 28;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function tableSvg(d: TableData): { svg: string; width: number; height: number } {
  const cols = d.h.length;
  const tableW = W_FIRST + W_COL * (cols - 1);
  const width = tableW + PAD * 2;
  const top = PAD + 34 + (d.s ? 24 : 0) + 14;
  const height = top + ROW_H * (d.r.length + 1) + (d.f ? 40 : 18) + PAD - 10;
  const colX = (i: number) => PAD + (i === 0 ? 0 : W_FIRST + W_COL * (i - 1));
  const colW = (i: number) => (i === 0 ? W_FIRST : W_COL);

  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Inter">`,
    `<rect width="100%" height="100%" fill="#ffffff"/>`,
    `<text x="${PAD}" y="${PAD + 24}" font-size="24" font-weight="700" fill="#0f172a">${esc(d.t)}</text>`,
  );
  if (d.s)
    out.push(`<text x="${PAD}" y="${PAD + 52}" font-size="15" fill="#64748b">${esc(d.s)}</text>`);

  // cabeçalho
  out.push(`<rect x="${PAD}" y="${top}" width="${tableW}" height="${ROW_H}" fill="#1e4e8c"/>`);
  d.h.forEach((h, i) => {
    const x = i === 0 ? colX(i) + 14 : colX(i) + colW(i) - 14;
    out.push(
      `<text x="${x}" y="${top + 29}" font-size="15" font-weight="700" fill="#ffffff" text-anchor="${i === 0 ? "start" : "end"}">${esc(h)}</text>`,
    );
  });

  d.r.forEach((row, ri) => {
    const y = top + ROW_H * (ri + 1);
    const total = row.k === "total";
    const fill = total ? "#dbe7f6" : ri % 2 === 0 ? "#ffffff" : "#f1f5fb";
    out.push(`<rect x="${PAD}" y="${y}" width="${tableW}" height="${ROW_H}" fill="${fill}"/>`);
    if (total)
      out.push(
        `<line x1="${PAD}" y1="${y}" x2="${PAD + tableW}" y2="${y}" stroke="#1e4e8c" stroke-width="2"/>`,
      );
    row.c.forEach((c, i) => {
      const x = i === 0 ? colX(i) + 14 : colX(i) + colW(i) - 14;
      const color = row.x?.[i] ?? (i === 0 ? "#0f172a" : "#1f2937");
      const weight = total || i === 0 ? 700 : 400;
      out.push(
        `<text x="${x}" y="${y + 29}" font-size="16" font-weight="${weight}" fill="${color}" text-anchor="${i === 0 ? "start" : "end"}">${esc(c)}</text>`,
      );
    });
  });

  // grade
  const bottom = top + ROW_H * (d.r.length + 1);
  for (let i = 1; i < cols; i++)
    out.push(
      `<line x1="${colX(i)}" y1="${top}" x2="${colX(i)}" y2="${bottom}" stroke="#cbd5e1" stroke-width="1"/>`,
    );
  for (let r = 1; r <= d.r.length; r++)
    out.push(
      `<line x1="${PAD}" y1="${top + ROW_H * r}" x2="${PAD + tableW}" y2="${top + ROW_H * r}" stroke="#e2e8f0" stroke-width="1"/>`,
    );
  out.push(
    `<rect x="${PAD}" y="${top}" width="${tableW}" height="${bottom - top}" fill="none" stroke="#94a3b8" stroke-width="1"/>`,
  );

  if (d.f)
    out.push(
      `<text x="${PAD}" y="${bottom + 28}" font-size="13" fill="#64748b">${esc(d.f)}</text>`,
    );
  out.push(`</svg>`);
  return { svg: out.join(""), width, height };
}

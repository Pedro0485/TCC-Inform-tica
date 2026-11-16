(() => {
  const button = document.querySelector('[data-salvar-horarios-pdf]');
  if (!button) return;

  const PAGE = { width: 842, height: 595, margin: 24 };
  const CP1252 = new Map([
    [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84],
    [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88],
    [0x2030, 0x89], [0x0160, 0x8a], [0x2039, 0x8b], [0x0152, 0x8c],
    [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92], [0x201c, 0x93],
    [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
    [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b],
    [0x0153, 0x9c], [0x017e, 0x9e], [0x0178, 0x9f]
  ]);

  const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();

  function pdfHex(value) {
    let bytes = '';
    for (const char of String(value)) {
      const code = char.codePointAt(0);
      let byte = CP1252.get(code);
      if (byte == null && (code <= 0x7f || (code >= 0xa0 && code <= 0xff))) byte = code;
      if (byte == null) {
        const fallback = char.normalize('NFD').replace(/\p{Diacritic}/gu, '');
        for (const plain of fallback) {
          const plainCode = plain.codePointAt(0);
          bytes += (plainCode <= 0xff ? plainCode : 0x3f).toString(16).padStart(2, '0');
        }
      } else {
        bytes += byte.toString(16).padStart(2, '0');
      }
    }
    return `<${bytes.toUpperCase()}>`;
  }

  function wrap(text, maxChars) {
    const words = clean(text).split(' ').filter(Boolean);
    const lines = [];
    let line = '';
    for (const word of words) {
      if (word.length > maxChars) {
        if (line) { lines.push(line); line = ''; }
        for (let i = 0; i < word.length; i += maxChars) lines.push(word.slice(i, i + maxChars));
        continue;
      }
      const candidate = line ? `${line} ${word}` : word;
      if (candidate.length > maxChars && line) { lines.push(line); line = word; }
      else line = candidate;
    }
    if (line) lines.push(line);
    return lines.length ? lines : [''];
  }

  function collectDays() {
    return [...document.querySelectorAll('#horarios-semana .horarios-dia')].map((day) => ({
      name: clean(day.querySelector('h3')?.textContent),
      lessons: [...day.querySelectorAll('.horarios-aula')].map((lesson) => ({
        time: clean(lesson.querySelector('.horarios-hora')?.textContent),
        subject: clean(lesson.querySelector('strong')?.textContent),
        details: [...lesson.querySelectorAll('.horarios-meta')].map((el) => clean(el.textContent)).filter(Boolean)
      }))
    }));
  }

  function layoutLesson(lesson, width, scale) {
    const innerWidth = width - 12;
    const lines = [];
    const addWrapped = (text, size, bold, leading) => {
      const maxChars = Math.max(10, Math.floor(innerWidth / (size * scale * 0.56)));
      wrap(text, maxChars).forEach((line) => lines.push({ text: line, size: size * scale, bold, leading: leading * scale }));
    };
    addWrapped(lesson.time || 'Horário', 7.1, false, 8.1);
    addWrapped(lesson.subject || 'Matéria não informada', 8.4, true, 9.2);
    lesson.details.forEach((detail) => addWrapped(detail, 6.1, false, 7.1));
    const height = 8 + lines.reduce((sum, line) => sum + line.leading, 0);
    return { lines, height };
  }

  function drawText(text, x, y, size, bold = false, color = '0.13 0.13 0.13') {
    return `${color} rg\nBT /${bold ? 'F2' : 'F1'} ${size.toFixed(2)} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm ${pdfHex(text)} Tj ET\n`;
  }

  function rect(x, y, width, height, fill, stroke = null) {
    let out = '';
    if (fill) out += `${fill} rg\n`;
    if (stroke) out += `${stroke} RG\n0.55 w\n`;
    out += `${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re ${fill && stroke ? 'B' : fill ? 'f' : 'S'}\n`;
    return out;
  }

  function buildContent(days, scale) {
    const { width, height, margin } = PAGE;
    const output = [];
    const top = 532;
    const headerHeight = 22;
    const bottom = margin;
    const gap = 7;
    const colWidth = (width - margin * 2 - gap * (days.length - 1)) / days.length;

    output.push(drawText('Horários de Aulas', margin, height - margin - 1, 17, true));
    output.push(drawText('Noctopus', width - margin - 52, height - margin, 8, false, '0.38 0.38 0.38'));
    output.push(`0.82 0.82 0.82 RG
0.55 w
${margin} ${top + 5} m ${width - margin} ${top + 5} l S
`);

    days.forEach((day, index) => {
      const x = margin + index * (colWidth + gap);
      output.push(rect(x, bottom, colWidth, top - bottom, null, '0.78 0.78 0.78'));
      output.push(rect(x, top - headerHeight, colWidth, headerHeight, '0.94 0.94 0.94', '0.78 0.78 0.78'));
      const title = day.name || `Dia ${index + 1}`;
      output.push(drawText(title, x + 6, top - 14, 8.2, true));

      let cursor = top - headerHeight - 5;
      if (!day.lessons.length) {
        output.push(drawText('Sem aulas', x + 6, cursor - 8, 7, false, '0.42 0.42 0.42'));
        return;
      }

      day.lessons.forEach((lesson) => {
        const card = layoutLesson(lesson, colWidth, scale);
        const cardHeight = card.height + 2;
        const cardY = cursor - cardHeight;
        output.push(rect(x + 3, cardY, colWidth - 6, cardHeight, '0.985 0.985 0.985', '0.87 0.87 0.87'));
        output.push(rect(x + 3, cardY, 2, cardHeight, '0.88 0.07 0.20'));
        let textY = cursor - 6;
        card.lines.forEach((line) => {
          textY -= line.size * 0.78;
          output.push(drawText(line.text, x + 8, textY, line.size, line.bold, line.bold ? '0.12 0.12 0.12' : '0.32 0.32 0.32'));
          textY -= line.leading - line.size * 0.78;
        });
        cursor = cardY - 2;
      });
    });

    const generated = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date());
    output.push(drawText(`Gerado em ${generated}`, margin, 16, 6.5, false, '0.45 0.45 0.45'));
    return output.join('');
  }

  function createPdf(content) {
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`
    ];
    let pdf = '%PDF-1.4\n%Noctopus\n';
    const offsets = [0];
    objects.forEach((object, index) => {
      offsets.push(pdf.length);
      pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xref = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    offsets.slice(1).forEach((offset) => { pdf += `${String(offset).padStart(10, '0')} 00000 n \n`; });
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return new Blob([pdf], { type: 'application/pdf' });
  }

  function downloadPdf(days) {
    const pageTop = 532;
    const pageBottom = PAGE.margin + 8;
    const headerHeight = 22;
    const available = pageTop - headerHeight - 5 - pageBottom;
    const gap = 7;
    const colWidth = (PAGE.width - PAGE.margin * 2 - gap * (days.length - 1)) / days.length;
    let scale = 1;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const tallest = Math.max(0, ...days.map((day) => day.lessons.reduce((sum, lesson) => sum + layoutLesson(lesson, colWidth, scale).height + 4, 0)));
      if (tallest <= available) break;
      scale *= Math.max(0.55, (available / tallest) * 0.94);
    }

    const blob = createPdf(buildContent(days, scale));
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const role = location.pathname.includes('/professor/') ? 'professor' : 'aluno';
    const date = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `horario-${role}-${date}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  button.addEventListener('click', () => {
    const days = collectDays();
    if (!days.length) {
      window.alert('Os horários ainda estão carregando. Aguarde alguns segundos e tente novamente.');
      return;
    }
    button.disabled = true;
    const original = button.innerHTML;
    button.innerHTML = '<i class="ti ti-loader-2"></i> Gerando PDF…';
    try {
      downloadPdf(days);
    } catch (error) {
      console.error('[horários] Não foi possível gerar o PDF:', error);
      window.alert('Não foi possível gerar o PDF. Atualize a página e tente novamente.');
    } finally {
      button.disabled = false;
      button.innerHTML = original;
    }
  });

  document.querySelectorAll('[data-exportar-horarios]').forEach((exportButton) => {
    exportButton.addEventListener('click', () => {
      const days = collectDays();
      if (!days.length) return window.alert('Os horários ainda estão carregando.');
      const format = exportButton.dataset.exportarHorarios;
      const role = location.pathname.includes('/professor/') ? 'professor' : 'aluno';
      const date = new Date().toISOString().slice(0, 10);
      const save = (blob, extension) => {
        const url = URL.createObjectURL(blob); const a = document.createElement('a');
        a.href = url; a.download = `horario-${role}-${date}.${extension}`; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
      };
      if (format === 'csv') {
        const quote = (v) => `"${String(v || '').replace(/"/g, '""')}"`;
        const rows = [['Dia','Horário','Matéria','Detalhes']];
        days.forEach((day) => day.lessons.forEach((lesson) => rows.push([day.name, lesson.time, lesson.subject, lesson.details.join(' | ')])));
        save(new Blob(['\ufeff' + rows.map((r) => r.map(quote).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' }), 'csv');
      } else {
        const canvas = document.createElement('canvas'); canvas.width = 1400; canvas.height = 1000;
        const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0,0,1400,1000);
        ctx.fillStyle = '#202124'; ctx.font = 'bold 30px Arial'; ctx.fillText('Horários de Aulas', 36, 48);
        const colW = 1320 / days.length;
        days.forEach((day, i) => {
          const x = 36 + i * colW; ctx.fillStyle = '#f1f3f5'; ctx.fillRect(x,70,colW-8,44);
          ctx.fillStyle = '#202124'; ctx.font = 'bold 17px Arial'; ctx.fillText(day.name, x+8,99);
          let y = 132;
          day.lessons.forEach((lesson) => {
            ctx.fillStyle = '#f8f9fb'; ctx.fillRect(x,y,colW-8,64);
            ctx.fillStyle = '#333'; ctx.font = '13px Arial'; ctx.fillText(lesson.time, x+8,y+18);
            ctx.font = 'bold 15px Arial'; ctx.fillText(lesson.subject.slice(0,28),x+8,y+38);
            ctx.font = '11px Arial'; ctx.fillText(lesson.details.join(' ').slice(0,34),x+8,y+54); y += 70;
          });
        });
        canvas.toBlob((blob) => blob && save(blob, 'png'), 'image/png');
      }
    });
  });
})();

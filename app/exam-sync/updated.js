'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { validateTest } = require('./model');

const SECTION_LABELS = { test: 'Тест', reading: 'Чтение', listening: 'Аудирование' };
const TF_OPTIONS = {
  tf: ['True', 'False'], tfng: ['True', 'False', 'Not Given'],
  yn: ['Yes', 'No'], ynng: ['Yes', 'No', 'Not Given'],
  ru: ['Верно', 'Неверно'], rung: ['Верно', 'Неверно', 'В тексте не сказано'],
};
const validId = id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(id);
const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
const text = value => typeof value === 'string' ? value.trim() : '';

function audioMedia(items) {
  return (Array.isArray(items) ? items : []).filter(item => item && item.kind === 'audio').map(item => {
    const src = item.src;
    if (typeof src !== 'string' || src.length > 140_000 ||
        !/^data:audio\/(?:mpeg|ogg|wav|webm);base64,[A-Za-z0-9+/]+={0,2}$/.test(src)) {
      throw new Error('В базовом экзамене найден неподдерживаемый аудиофайл');
    }
    return { kind: 'audio', name: text(item.name).slice(0, 120), src };
  });
}

function makeQuestions(exam) {
  const questions = [];
  const weights = {};
  const settings = exam.settings || {};
  for (const section of ['test', 'reading', 'listening']) {
    const data = exam.sections && exam.sections[section];
    if (!data || settings.enabled && settings.enabled[section] === false) continue;
    const context = [text(data.instructions)];
    const media = audioMedia(data.media);
    let mediaUsed = false;
    for (const task of Array.isArray(data.tasks) ? data.tasks : []) {
      if (!task || typeof task !== 'object') continue;
      if (task.type === 'info') {
        const block = [text(task.title), text(task.text)].filter(Boolean).join('\n');
        if (block) context.push(block);
        continue;
      }
      const prompt = text(task.question);
      const sharedText = [SECTION_LABELS[section], ...context, prompt].filter(Boolean).join('\n\n');
      const weight = Math.max(0, Number(task.points) || 0);
      const idBase = `q-${String(task.id || questions.length).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80)}`;
      const taskMedia = !mediaUsed ? [...media, ...audioMedia(task.media)] : audioMedia(task.media);
      if (taskMedia.length) mediaUsed = true;
      const add = (suffix, row, rawPoints = weight) => {
        if (!validId(row.id)) row.id = `${idBase}-${suffix}`;
        row.skill = section;
        row.points = rawPoints;
        row.media = taskMedia;
        questions.push(row);
        weights[section] = (weights[section] || 0) + rawPoints;
      };
      switch (task.type) {
        case 'mc':
          if (!Array.isArray(task.options) || !Number.isInteger(task.answer) || task.options[task.answer] === undefined) throw new Error('Некорректный вопрос с одним вариантом');
          add('single', { id: idBase, type: 'single', text: sharedText, options: task.options.map(text), correct: task.answer });
          break;
        case 'multi':
          if (!Array.isArray(task.options) || !Array.isArray(task.answers) || !task.answers.length) throw new Error('Некорректный вопрос с несколькими вариантами');
          add('multi', { id: idBase, type: 'multi', text: sharedText, options: task.options.map(text), correct: task.answers, partial: true });
          break;
        case 'tf': {
          const options = TF_OPTIONS[task.variant];
          if (!options || !Number.isInteger(task.answer) || task.answer < 0 || task.answer >= options.length) throw new Error('Некорректный вопрос «Верно / Неверно»');
          add('tf', { id: idBase, type: 'single', text: sharedText, options, correct: task.answer });
          break;
        }
        case 'short': {
          const answers = String(task.answer ?? '').split('|').map(x => x.trim()).filter(Boolean);
          if (!answers.length) throw new Error('В коротком вопросе нет правильного ответа');
          add('short', { id: idBase, type: 'input', text: sharedText, answers, caseSensitive: false });
          break;
        }
        case 'gap': {
          const raw = text(task.question);
          const matches = [...raw.matchAll(/\{\{([^{}]{1,500})\}\}/g)];
          if (!matches.length) throw new Error('В вопросе с пропуском не найден ответ');
          matches.forEach((match, index) => {
            const answers = match[1].split('|').map(x => x.trim()).filter(Boolean);
            if (!answers.length) throw new Error('В вопросе с пропуском пустой ответ');
            const blanked = raw.replace(/\{\{[^{}]{1,500}\}\}/g, '_____');
            const perGap = raw.slice(0, match.index) + '⟦_____⟧' + raw.slice(match.index + match[0].length);
            const display = [SECTION_LABELS[section], ...context, perGap || blanked,
              matches.length > 1 ? `Пропуск ${index + 1} из ${matches.length}` : ''].filter(Boolean).join('\n\n');
            add(`gap-${index + 1}`, { id: `${idBase}-gap-${index + 1}`, type: 'input', text: display, answers, caseSensitive: false }, weight / matches.length);
          });
          break;
        }
        case 'match': {
          if (!Array.isArray(task.left) || !Array.isArray(task.right) || !Array.isArray(task.answer) || task.answer.length !== task.left.length) throw new Error('Некорректное задание на сопоставление');
          const pairs = task.left.map((label, i) => ({ label: text(label), right: text(task.right[task.answer[i]]) }));
          if (pairs.some(pair => !pair.label || !pair.right)) throw new Error('В задании на сопоставление отсутствует вариант');
          add('match', { id: idBase, type: 'match', text: sharedText, pairs, partial: true });
          break;
        }
        default:
          throw new Error(`Неподдерживаемый тип задания: ${String(task.type || '')}`);
      }
    }
    // Сохраняем веса навыков из обновлённой версии. Старый движок показывает тест,
    // чтение и аудирование как один проход, поэтому объединяет их баллы в общий тест.
    const target = Number(settings.skillPoints && settings.skillPoints[section]);
    if (target > 0 && weights[section] > 0) {
      const rows = questions.filter(q => q.skill === section);
      let assigned = 0;
      rows.forEach((q, i) => {
        q.points = i === rows.length - 1
          ? round2(target - assigned)
          : round2(q.points * target / weights[section]);
        assigned = round2(assigned + q.points);
      });
      weights[section] = target;
    }
  }
  return { questions, weights };
}

function convert(source, version) {
  if (!source || !Number.isSafeInteger(source.version) || source.version < 1 || source.version !== version ||
      !Array.isArray(source.tests) || !Array.isArray(source.rooms)) {
    throw new Error('Файл обновлённых экзаменов имеет неподдерживаемый формат');
  }
  const roomsByTest = new Map(source.rooms.flatMap(room => (room.test?.testIds || []).map(id => [id, room])));
  const exams = [];
  for (const sourceTest of source.tests) {
    if (!validId(sourceTest.id) || !sourceTest.exam) throw new Error('В архиве есть экзамен без корректного ID');
    const id = `ku-upd-${sourceTest.id}`;
    const { questions, weights } = makeQuestions(sourceTest.exam);
    if (!questions.length || questions.length > 400) throw new Error(`В экзамене «${text(sourceTest.title)}» нет поддерживаемых заданий`);
    const title = text(sourceTest.title).slice(0, 200);
    const test = {
      id, title, description: text(sourceTest.description).slice(0, 2000),
      timeLimit: Math.max(0, Number(sourceTest.timeLimit) || Number(sourceTest.exam.settings?.timeLimit) || 0),
      passPercent: Math.max(0, Math.min(100, Number(sourceTest.passPercent) || 60)),
      shuffle: !!sourceTest.shuffle, showAnswers: sourceTest.showAnswers !== false,
      questions, updatedBaseVersion: version,
    };
    validateTest(test);
    const originalRoom = roomsByTest.get(sourceTest.id);
    if (!originalRoom) throw new Error(`Для экзамена «${title}» не найдена комната`);
    const writing = originalRoom.writing || {}, speaking = originalRoom.speaking || {};
    const room = {
      id: `ku-upd-room-${sourceTest.id}`, title: text(originalRoom.title || title).slice(0, 200),
      description: text(originalRoom.description || sourceTest.description).slice(0, 2000),
      open: true, createdAt: Number(originalRoom.createdAt) || 0,
      test: { on: true, testIds: [id], max: round2(Object.values(weights).reduce((sum, value) => sum + value, 0)) },
      writing: {
        on: writing.on !== false, prompt: text(writing.prompt), minWords: Math.max(0, Number(writing.minWords) || 0),
        max: Math.max(0, Number(writing.max) || 0), minutes: Math.max(0, Number(writing.minutes) || 0),
      },
      speaking: {
        on: speaking.on !== false, prompt: text(speaking.prompt), minutes: Math.max(0, Number(speaking.minutes) || 0),
        max: Math.max(0, Number(speaking.max) || 0),
      },
      updatedBaseVersion: version,
    };
    exams.push({ test, room });
  }
  return exams;
}

function mergeUpdated(db, file = path.join(__dirname, 'base-exams.json')) {
  const source = JSON.parse(fs.readFileSync(file, 'utf8'));
  const rows = convert(source, source.version);
  let changed = false;
  const replacements = new Map(rows.map(({ room }) => [room.title.trim().toLocaleLowerCase(), room]));
  const newRoomIds = new Set(rows.map(({ room }) => room.id));
  for (const { test, room } of rows) {
    const oldTest = db.tests.get(test.id);
    if (!oldTest || Number(oldTest.updatedBaseVersion || 0) < test.updatedBaseVersion) {
      db.tests.set(test.id, test); changed = true;
    }
    const oldRoom = db.rooms.get(room.id);
    if (!oldRoom || Number(oldRoom.updatedBaseVersion || 0) < room.updatedBaseVersion) {
      db.rooms.set(room.id, room); changed = true;
    }
  }
  // Комнаты прежней версии с тем же названием закрываются для новых попыток,
  // но сами комнаты и все связанные работы/оценки остаются в базе как история.
  for (const [id, old] of db.rooms) {
    if (newRoomIds.has(id) || old.open === false) continue;
    const replacement = replacements.get(text(old.title).toLocaleLowerCase());
    if (!replacement) continue;
    db.rooms.set(id, { ...old, open: false, updatedReplacedBy: replacement.id });
    changed = true;
  }
  return changed;
}

module.exports = { convert, mergeUpdated };

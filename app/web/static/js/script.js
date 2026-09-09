const searchForm = document.querySelector("#search-form");
const homeView = document.querySelector("#home-view");
const uploadView = document.querySelector("#upload-view");
const resultsListView = document.querySelector("#results-list-view");
const showUploadButton = document.querySelector("#show-upload");
const showReportsButton = document.querySelector("#show-reports");
const searchButton = document.querySelector("#search-button");
const searchInput = document.querySelector("#ra-search");
const statusMessage = document.querySelector("#status-message");
const resultsWorkspace = document.querySelector("#results-workspace");
const resultsSection = document.querySelector("#results-section");
const studentResult = document.querySelector("#student-result");
const classStudentsPanel = document.querySelector("#class-students-panel");
const classStudentsResult = document.querySelector("#class-students-result");
const selectedClassTitle = document.querySelector("#selected-class-title");
const selectedClassCount = document.querySelector("#selected-class-count");
const printSelectedClassButton = document.querySelector("#print-selected-class");
const reportPreview = document.querySelector("#report-preview");
const printReportButton = document.querySelector("#print-report");
const modalClass = document.querySelector("#modal-class");
const modalName = document.querySelector("#modal-name");
const importForm = document.querySelector("#import-form");
const spreadsheetFile = document.querySelector("#spreadsheet-file");
const importButton = document.querySelector("#import-button");
const importStatus = document.querySelector("#import-status");
const classPrintArea = document.querySelector("#class-print-area");
let selectedClass = "";

function setStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.classList.toggle("error", isError);
}

function showView(view) {
  const isUpload = view === "upload";
  homeView.hidden = false;
  uploadView.hidden = !isUpload;
  resultsListView.hidden = isUpload;

  if (view === "upload") {
    closeReport();
    classStudentsPanel.hidden = true;
    uploadView.scrollIntoView({ behavior: "smooth", block: "start" });
  } else if (view === "reports") {
    resultsListView.scrollIntoView({ behavior: "smooth", block: "start" });
  } else {
    closeReport();
  }
}

function setImportStatus(message, isError = false) {
  importStatus.textContent = message;
  importStatus.hidden = !message;
  importStatus.classList.toggle("error", isError);
}

function hideResults(message, isError = false) {
  studentResult.innerHTML = "";
  resultsWorkspace.hidden = true;
  classStudentsPanel.hidden = true;
  reportPreview.hidden = true;
  setStatus(message, isError);
}

function renderStudents(students, accessStudent) {
  resultsWorkspace.hidden = false;
  classStudentsPanel.hidden = false;
  selectedClassTitle.textContent = "Aluno localizado";
  selectedClassCount.textContent = `${students.length} aluno(s) encontrado(s).`;
  printSelectedClassButton.hidden = true;
  classStudentsResult.innerHTML = "";
  setStatus("");

  students.forEach((student) => {
    const row = document.createElement("div");
    row.className = "class-student-row";

    const identity = document.createElement("div");
    identity.className = "student-identity";

    const name = document.createElement("strong");
    name.textContent = student.nome_aluno ?? "";
    const details = document.createElement("span");
    details.textContent = `Turma: ${student.turma ?? ""} · RA: ${student.ra ?? ""}`;
    identity.append(name, details);

    const accessButton = document.createElement("button");
    accessButton.type = "button";
    accessButton.textContent = "Acessar";
    accessButton.addEventListener("click", () => accessStudent(student, accessButton));

    const raCell = document.createElement("span");
    raCell.className = "student-ra";
    raCell.textContent = student.ra ?? "";
    row.append(identity, raCell, accessButton);
    classStudentsResult.append(row);
  });
}

function renderRecords(records) {
  if (records.length === 0) {
    hideResults("Nenhum registro encontrado para este RA.");
    return;
  }
  renderStudents([records[0]], () => openReport(records));
}

function renderClassStudents(schoolClass, students) {
  selectedClass = schoolClass;
  classStudentsPanel.hidden = false;
  selectedClassTitle.textContent = `Alunos da turma ${schoolClass}`;
  selectedClassCount.textContent = `${students.length} aluno(s) encontrado(s).`;
  printSelectedClassButton.hidden = false;
  classStudentsResult.innerHTML = "";

  students.forEach((student) => {
    const row = document.createElement("div");
    row.className = "class-student-row";

    const identity = document.createElement("div");
    identity.className = "student-identity";
    const name = document.createElement("strong");
    name.textContent = student.nome_aluno ?? "";
    identity.append(name);

    const raCell = document.createElement("span");
    raCell.className = "student-ra";
    raCell.textContent = student.ra ?? "";

    const accessButton = document.createElement("button");
    accessButton.type = "button";
    accessButton.textContent = "Acessar";
    accessButton.addEventListener("click", () => loadStudentReport(student, accessButton));
    row.append(identity, raCell, accessButton);
    classStudentsResult.append(row);
  });

  if (students.length === 0) {
    const empty = document.createElement("p");
    empty.className = "tree-empty";
    empty.textContent = "Nenhum aluno encontrado nesta turma.";
    classStudentsResult.append(empty);
  }
}

async function loadClassStudents(schoolClass, button) {
  button.disabled = true;
  setStatus(`Carregando alunos da turma ${schoolClass}...`);
  try {
    const payload = await requestJson("/api/search-class", { turma: schoolClass });
    renderClassStudents(schoolClass, payload.students || []);
    document.querySelectorAll(".tree-class").forEach((item) => {
      item.classList.remove("selected");
    });
    button.closest(".tree-class")?.classList.add("selected");
    setStatus("");
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    button.disabled = false;
  }
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function clearReport() {
  ["port", "math"].forEach((subject) => {
    for (let bimester = 1; bimester <= 4; bimester += 1) {
      document.querySelector(`#${subject}-score-${bimester}`).textContent = "";
      document.querySelector(`#${subject}-level-${bimester}`).textContent = "";
    }
  });
}

function openReport(records) {
  clearReport();
  modalName.textContent = records[0]?.nome_aluno ?? "";
  modalClass.textContent = records[0]?.turma ?? "";

  records.forEach((record) => {
    const component = normalizeText(record.componente);
    const subject = component.includes("matematica")
      ? "math"
      : component.includes("portugues")
        ? "port"
        : "";
    const bimester = String(record.bimestre || "").replace(/\D/g, "").slice(0, 1);

    if (!subject || !["1", "2", "3", "4"].includes(bimester)) {
      return;
    }

    document.querySelector(`#${subject}-score-${bimester}`).textContent = record.proficiencia ?? "";
    document.querySelector(`#${subject}-level-${bimester}`).textContent = record.nivel ?? "";
  });

  reportPreview.hidden = false;
  resultsWorkspace.hidden = false;
  document.body.classList.add("report-open");
}

function closeReport() {
  reportPreview.hidden = true;
  document.body.classList.remove("report-open");
}

function normalizeRa(value) {
  return String(value ?? "")
    .trim()
    .replace(/\.0+$/, "")
    .replace(/[\s.\-]/g, "");
}

async function readApiResponse(response) {
  const text = await response.text();
  if (!text) {
    throw new Error("O servidor não retornou uma resposta.");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("O servidor retornou uma resposta inválida.");
  }
}

async function requestJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await readApiResponse(response);
  if (!response.ok) {
    throw new Error(payload.detail || "Não foi possível realizar a consulta.");
  }
  return payload;
}

async function loadStudentReport(student, button) {
  button.disabled = true;
  setStatus(`Carregando resultado de ${student.nome_aluno}...`);
  try {
    const payload = await requestJson("/api/search", { ra: student.ra });
    const records = payload.records || [];
    if (records.length === 0) {
      throw new Error("Nenhum resultado encontrado para este aluno.");
    }
    document.querySelectorAll(".student-row, .tree-student-row, .class-student-row").forEach((row) => {
      row.classList.remove("selected");
    });
    button.closest(".student-row, .tree-student-row")?.classList.add("selected");
    setStatus("");
    openReport(records);
    if (window.matchMedia("(max-width: 960px)").matches) {
      reportPreview.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    button.disabled = false;
  }
}

async function searchByRa() {
  const ra = normalizeRa(searchInput.value);
  if (!ra) {
    searchInput.focus();
    setStatus("Digite o RA do aluno para realizar a busca.", true);
    return;
  }

  searchButton.disabled = true;
  classStudentsPanel.hidden = true;
  reportPreview.hidden = true;
  setStatus("Buscando aluno...");
  try {
    const payload = await requestJson("/api/search", { ra });
    const records = payload.records || [];
    if (records.length === 0) {
      setStatus("Nenhum registro encontrado para este RA.", true);
      return;
    }
    renderRecords(records);
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    searchButton.disabled = false;
  }
}

function renderClassTree(schoolYear, classes) {
  resultsWorkspace.hidden = false;
  reportPreview.hidden = true;
  classStudentsPanel.hidden = true;
  selectedClass = "";
  studentResult.innerHTML = "";
  studentResult.className = "student-result folder-tree";

  const yearItem = document.createElement("div");
  yearItem.className = "tree-item tree-year";
  const yearButton = document.createElement("button");
  yearButton.className = "tree-toggle";
  yearButton.type = "button";
  yearButton.setAttribute("aria-expanded", "true");

  const yearChevron = document.createElement("span");
  yearChevron.className = "tree-chevron";
  yearChevron.textContent = "▾";
  const yearFolder = document.createElement("span");
  yearFolder.className = "tree-folder-icon";
  yearFolder.textContent = "📂";
  const yearLabel = document.createElement("strong");
  yearLabel.textContent = String(schoolYear);
  yearButton.append(yearChevron, yearFolder, yearLabel);

  const classesContainer = document.createElement("div");
  classesContainer.className = "tree-children";
  classes.forEach((schoolClass) => {
    classesContainer.append(createClassFolder(schoolClass));
  });

  yearButton.addEventListener("click", () => {
    const expanded = yearButton.getAttribute("aria-expanded") === "true";
    yearButton.setAttribute("aria-expanded", String(!expanded));
    yearChevron.textContent = expanded ? "▸" : "▾";
    yearFolder.textContent = expanded ? "📁" : "📂";
    classesContainer.hidden = expanded;
  });

  yearItem.append(yearButton, classesContainer);
  studentResult.append(yearItem);
}

function createClassFolder(schoolClass) {
  const item = document.createElement("div");
  item.className = "tree-item tree-class";
  const header = document.createElement("div");
  header.className = "tree-class-header";
  const button = document.createElement("button");
  button.className = "tree-toggle";
  button.type = "button";
  button.setAttribute("aria-expanded", "false");

  const chevron = document.createElement("span");
  chevron.className = "tree-chevron";
  chevron.textContent = "▸";
  const folder = document.createElement("span");
  folder.className = "tree-folder-icon";
  folder.textContent = "📁";
  const label = document.createElement("strong");
  label.textContent = schoolClass;
  button.append(chevron, folder, label);

  const printClassButton = document.createElement("button");
  printClassButton.className = "print-class-button";
  printClassButton.type = "button";
  printClassButton.textContent = "Imprimir turma";
  printClassButton.addEventListener("click", () => {
    printWholeClass(schoolClass, printClassButton);
  });
  header.append(button, printClassButton);

  const studentsContainer = document.createElement("div");
  studentsContainer.className = "tree-students";
  studentsContainer.hidden = true;
  let loaded = false;

  button.addEventListener("click", async () => {
    const expanded = button.getAttribute("aria-expanded") === "true";
    if (expanded) {
      button.setAttribute("aria-expanded", "false");
      chevron.textContent = "▸";
      folder.textContent = "📁";
      studentsContainer.hidden = true;
      item.classList.remove("selected");
      return;
    }

    button.setAttribute("aria-expanded", "true");
    chevron.textContent = "▾";
    folder.textContent = "📂";
    studentsContainer.hidden = false;
    document.querySelectorAll(".tree-class").forEach((classItem) => {
      classItem.classList.remove("selected");
    });
    item.classList.add("selected");
    if (loaded) {
      return;
    }

    button.disabled = true;
    setStatus(`Carregando alunos da turma ${schoolClass}...`);
    try {
      const payload = await requestJson("/api/search-class", { turma: schoolClass });
      const students = payload.students || [];
      studentsContainer.innerHTML = "";
      students.forEach((student) => {
        const row = document.createElement("div");
        row.className = "tree-student-row";
        const identity = document.createElement("div");
        identity.className = "student-identity";
        const name = document.createElement("strong");
        name.textContent = student.nome_aluno ?? "";
        const ra = document.createElement("span");
        ra.textContent = `RA: ${student.ra ?? ""}`;
        identity.append(name, ra);

        const accessButton = document.createElement("button");
        accessButton.type = "button";
        accessButton.textContent = "Acessar";
        accessButton.addEventListener("click", () => loadStudentReport(student, accessButton));
        row.append(identity, accessButton);
        studentsContainer.append(row);
      });
      if (students.length === 0) {
        const empty = document.createElement("p");
        empty.className = "tree-empty";
        empty.textContent = "Nenhum aluno encontrado nesta turma.";
        studentsContainer.append(empty);
      }
      loaded = true;
      setStatus(`${students.length} aluno(s) na turma ${schoolClass}.`);
    } catch (error) {
      setStatus(error.message, true);
      button.setAttribute("aria-expanded", "false");
      chevron.textContent = "▸";
      folder.textContent = "📁";
      studentsContainer.hidden = true;
    } finally {
      button.disabled = false;
    }
  });

  item.append(header, studentsContainer);
  return item;
}

function reportValue(records, subjectName, bimester, field) {
  const record = records.find((item) => {
    const component = normalizeText(item.componente);
    return component.includes(subjectName) && Number(item.bimestre) === bimester;
  });
  return record?.[field] ?? "";
}

function createMiniReport(report) {
  const article = document.createElement("article");
  article.className = "mini-report";

  const school = document.createElement("p");
  school.className = "mini-school";
  school.textContent = "EMEF Procópio Ferreira";
  const title = document.createElement("h2");
  title.textContent = "Resultado de prova";
  const testName = document.createElement("p");
  testName.innerHTML = "<strong>Nome da prova:</strong> Saberes e Aprendizagens da SME-SP";
  const period = document.createElement("p");
  period.innerHTML = "<strong>Período:</strong> 1º, 2º, 3º e 4º Bimestre de 2026";
  const student = document.createElement("p");
  const studentLabel = document.createElement("strong");
  studentLabel.textContent = `Turma: ${report.turma ?? ""} - Nome: `;
  student.append(studentLabel, document.createTextNode(report.nome_aluno ?? ""));
  article.append(school, title, testName, period, student);

  const table = document.createElement("table");
  table.className = "mini-report-table";
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  ["Disciplina", "Bimestre", "Proficiência", "Nível"].forEach((text) => {
    const cell = document.createElement("th");
    cell.textContent = text;
    headRow.append(cell);
  });
  head.append(headRow);
  table.append(head);

  const body = document.createElement("tbody");
  [
    ["Português", "portugues"],
    ["Matemática", "matematica"],
  ].forEach(([labelText, subjectName]) => {
    [1, 2, 3, 4].forEach((bimester) => {
      const row = document.createElement("tr");
      if (bimester === 1) {
        const subject = document.createElement("th");
        subject.rowSpan = 4;
        subject.textContent = labelText;
        row.append(subject);
      }
      const bimesterCell = document.createElement("td");
      bimesterCell.textContent = `${bimester}º Bim`;
      const score = document.createElement("td");
      score.textContent = reportValue(report.records || [], subjectName, bimester, "proficiencia");
      const level = document.createElement("td");
      level.textContent = reportValue(report.records || [], subjectName, bimester, "nivel");
      row.append(bimesterCell, score, level);
      body.append(row);
    });
  });
  table.append(body);
  article.append(table);
  return article;
}

function renderClassPrint(reports) {
  classPrintArea.innerHTML = "";
  for (let start = 0; start < reports.length; start += 6) {
    const page = document.createElement("section");
    page.className = "class-print-page";
    reports.slice(start, start + 6).forEach((report) => {
      page.append(createMiniReport(report));
    });
    classPrintArea.append(page);
  }
}

async function printWholeClass(schoolClass, button) {
  button.disabled = true;
  setStatus(`Preparando os boletins da turma ${schoolClass}...`);
  try {
    const payload = await requestJson("/api/reports-class", { turma: schoolClass });
    const reports = payload.reports || [];
    if (reports.length === 0) {
      throw new Error("Nenhum boletim encontrado para esta turma.");
    }
    renderClassPrint(reports);
    classPrintArea.hidden = false;
    document.body.classList.add("printing-class");
    setStatus(`${reports.length} boletim(ns) preparados para impressão.`);
    window.addEventListener(
      "afterprint",
      () => {
        document.body.classList.remove("printing-class");
        classPrintArea.hidden = true;
      },
      { once: true },
    );
    window.print();
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    button.disabled = false;
  }
}

async function loadClassTree() {
  hideResults("Carregando pastas de turmas...");
  try {
    const payload = await requestJson("/api/classes", {});
    const classes = payload.classes || [];
    if (classes.length === 0) {
      hideResults("Nenhuma turma encontrada.");
      return;
    }
    renderClassTree(payload.school_year, classes);
    setStatus(`${classes.length} turma(s) encontrada(s). Abra uma pasta para ver os alunos.`);
  } catch (error) {
    hideResults(error.message, true);
  }
}

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  searchByRa();
});

spreadsheetFile.addEventListener("change", () => {
  const file = spreadsheetFile.files[0];
  if (file) {
    importForm.requestSubmit();
  }
});

importForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const file = spreadsheetFile.files[0];
  if (!file) {
    setImportStatus("Selecione uma planilha antes de importar.", true);
    return;
  }

  const formData = new FormData();
  formData.append("file", file);
  importButton.disabled = true;
  setImportStatus("Importando planilha...");
  try {
    const response = await fetch("/api/import", {
      method: "POST",
      body: formData,
    });
    const payload = await readApiResponse(response);
    if (!response.ok) {
      throw new Error(payload.detail || "Não foi possível importar a planilha.");
    }
    spreadsheetFile.value = "";
    setImportStatus(
      `Importação concluída: ${payload.count} registros de ${payload.students} alunos.`,
    );
    loadClassTree();
  } catch (error) {
    setImportStatus(error.message, true);
  } finally {
    importButton.disabled = false;
  }
});

printReportButton.addEventListener("click", () => window.print());

showUploadButton.addEventListener("click", () => showView("upload"));
showReportsButton.addEventListener("click", () => showView("reports"));
document.querySelectorAll("[data-show-home]").forEach((button) => {
  button.addEventListener("click", () => showView("home"));
});

printSelectedClassButton.addEventListener("click", () => {
  if (selectedClass) {
    printWholeClass(selectedClass, printSelectedClassButton);
  }
});

document.querySelectorAll("[data-close-report]").forEach((element) => {
  element.addEventListener("click", closeReport);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !reportPreview.hidden) {
    closeReport();
  }
});

loadClassTree();

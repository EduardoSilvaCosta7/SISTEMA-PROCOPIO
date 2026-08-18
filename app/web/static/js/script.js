const searchForm = document.querySelector("#search-form");
const searchButton = document.querySelector("#search-button");
const searchInput = document.querySelector("#ra-search");
const searchLabel = document.querySelector("#search-label");
const modeRaButton = document.querySelector("#mode-ra");
const modeClassButton = document.querySelector("#mode-class");
const statusMessage = document.querySelector("#status-message");
const resultsWorkspace = document.querySelector("#results-workspace");
const resultsSection = document.querySelector("#results-section");
const studentResult = document.querySelector("#student-result");
const reportPreview = document.querySelector("#report-preview");
const printReportButton = document.querySelector("#print-report");
const modalClass = document.querySelector("#modal-class");
const modalName = document.querySelector("#modal-name");
const importForm = document.querySelector("#import-form");
const spreadsheetFile = document.querySelector("#spreadsheet-file");
const importButton = document.querySelector("#import-button");
const importStatus = document.querySelector("#import-status");
let searchMode = "ra";

function setStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.classList.toggle("error", isError);
}

function setImportStatus(message, isError = false) {
  importStatus.textContent = message;
  importStatus.classList.toggle("error", isError);
}

function hideResults(message, isError = false) {
  studentResult.innerHTML = "";
  resultsWorkspace.hidden = true;
  resultsWorkspace.classList.remove("has-preview");
  reportPreview.hidden = true;
  setStatus(message, isError);
}

function renderStudents(students, accessStudent) {
  resultsWorkspace.hidden = false;
  studentResult.innerHTML = "";
  studentResult.className = "student-result";
  setStatus("");

  students.forEach((student) => {
    const row = document.createElement("div");
    row.className = "student-row";

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

    row.append(identity, accessButton);
    studentResult.append(row);
  });
}

function renderRecords(records) {
  if (records.length === 0) {
    hideResults("Nenhum registro encontrado para este RA.");
    return;
  }
  renderStudents([records[0]], () => openReport(records));
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function clearReport() {
  ["port", "math"].forEach((subject) => {
    for (let semester = 1; semester <= 2; semester += 1) {
      document.querySelector(`#${subject}-score-${semester}`).textContent = "";
      document.querySelector(`#${subject}-level-${semester}`).textContent = "";
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
    const semester = String(record.semestre || "").replace(/\D/g, "").slice(0, 1);

    if (!subject || !["1", "2"].includes(semester)) {
      return;
    }

    document.querySelector(`#${subject}-score-${semester}`).textContent = record.proficiencia ?? "";
    document.querySelector(`#${subject}-level-${semester}`).textContent = record.nivel ?? "";
  });

  reportPreview.hidden = false;
  resultsWorkspace.hidden = false;
  resultsWorkspace.classList.add("has-preview");
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

function setSearchMode(mode) {
  searchMode = mode;
  const isRa = mode === "ra";
  modeRaButton.classList.toggle("active", isRa);
  modeClassButton.classList.toggle("active", !isRa);
  modeRaButton.setAttribute("aria-pressed", String(isRa));
  modeClassButton.setAttribute("aria-pressed", String(!isRa));
  searchForm.hidden = !isRa;
  searchInput.value = "";
  if (isRa) {
    searchLabel.textContent = "RA do aluno";
    searchInput.placeholder = "Digite o RA";
    searchInput.inputMode = "numeric";
    hideResults("Digite o RA do aluno para realizar a busca.");
    searchInput.focus();
  } else {
    loadClassTree();
  }
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
    document.querySelectorAll(".student-row, .tree-student-row").forEach((row) => {
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
    hideResults("Digite o RA do aluno para realizar a busca.");
    return;
  }

  searchButton.disabled = true;
  hideResults("Buscando aluno...");
  try {
    const payload = await requestJson("/api/search", { ra });
    renderRecords(payload.records || []);
  } catch (error) {
    hideResults(error.message, true);
  } finally {
    searchButton.disabled = false;
  }
}

function renderClassTree(schoolYear, classes) {
  resultsWorkspace.hidden = false;
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
      return;
    }

    button.setAttribute("aria-expanded", "true");
    chevron.textContent = "▾";
    folder.textContent = "📂";
    studentsContainer.hidden = false;
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

  item.append(button, studentsContainer);
  return item;
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

modeRaButton.addEventListener("click", () => setSearchMode("ra"));
modeClassButton.addEventListener("click", () => setSearchMode("class"));

searchInput.addEventListener("input", () => {
  if (!resultsWorkspace.hidden) {
    hideResults("Clique em Buscar para realizar a consulta.");
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
  } catch (error) {
    setImportStatus(error.message, true);
  } finally {
    importButton.disabled = false;
  }
});

printReportButton.addEventListener("click", () => window.print());

setSearchMode("ra");

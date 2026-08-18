const searchForm = document.querySelector("#search-form");
const searchButton = document.querySelector("#search-button");
const searchInput = document.querySelector("#ra-search");
const statusMessage = document.querySelector("#status-message");
const resultsSection = document.querySelector("#results-section");
const studentResult = document.querySelector("#student-result");
const reportModal = document.querySelector("#report-modal");
const closeModalButton = document.querySelector("#close-modal");
const printReportButton = document.querySelector("#print-report");
const modalClass = document.querySelector("#modal-class");
const modalName = document.querySelector("#modal-name");
const importForm = document.querySelector("#import-form");
const spreadsheetFile = document.querySelector("#spreadsheet-file");
const importButton = document.querySelector("#import-button");
const importStatus = document.querySelector("#import-status");

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
  resultsSection.hidden = true;
  setStatus(message, isError);
}

function renderRecords(records) {
  if (records.length === 0) {
    hideResults("Nenhum registro encontrado para este RA.");
    return;
  }

  resultsSection.hidden = false;
  studentResult.innerHTML = "";
  setStatus("");

  const student = records[0];
  const identity = document.createElement("div");
  identity.className = "student-identity";

  const name = document.createElement("strong");
  name.textContent = student.nome_aluno ?? "";
  const schoolClass = document.createElement("span");
  schoolClass.textContent = `Turma: ${student.turma ?? ""}`;
  identity.append(name, schoolClass);

  const accessButton = document.createElement("button");
  accessButton.type = "button";
  accessButton.textContent = "Acessar";
  accessButton.addEventListener("click", () => openReport(records));
  studentResult.append(identity, accessButton);
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

  reportModal.showModal();
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

async function searchByRa() {
  const ra = normalizeRa(searchInput.value);
  if (!ra) {
    hideResults("Digite o RA do aluno para realizar a busca.");
    return;
  }

  searchButton.disabled = true;
  hideResults("Buscando aluno...");

  try {
    const response = await fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ra }),
    });
    const payload = await readApiResponse(response);

    if (!response.ok) {
      throw new Error(payload.detail || "Não foi possível consultar o aluno.");
    }

    renderRecords(payload.records || []);
  } catch (error) {
    hideResults(error.message, true);
  } finally {
    searchButton.disabled = false;
  }
}

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  searchByRa();
});

searchInput.addEventListener("input", () => {
  if (!resultsSection.hidden) {
    hideResults("Clique em Buscar para consultar o RA informado.");
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

closeModalButton.addEventListener("click", () => reportModal.close());
printReportButton.addEventListener("click", () => window.print());

reportModal.addEventListener("click", (event) => {
  if (event.target === reportModal) {
    reportModal.close();
  }
});

hideResults("Digite o RA do aluno para realizar a busca.");

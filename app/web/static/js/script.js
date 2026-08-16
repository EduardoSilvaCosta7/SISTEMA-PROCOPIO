const STORAGE_KEY = "resultado_planilha_registros";

const form = document.querySelector("#upload-form");
const searchForm = document.querySelector("#search-form");
const fileInput = document.querySelector("#spreadsheet-file");
const clearButton = document.querySelector("#clear-button");
const searchInput = document.querySelector("#ra-search");
const statusMessage = document.querySelector("#status-message");
const resultsSection = document.querySelector("#results-section");
const studentResult = document.querySelector("#student-result");
const reportModal = document.querySelector("#report-modal");
const closeModalButton = document.querySelector("#close-modal");
const printReportButton = document.querySelector("#print-report");
const modalClass = document.querySelector("#modal-class");
const modalName = document.querySelector("#modal-name");

let storedDataNeedsRefresh = false;
let allRecords = getStoredRecords();

function getStoredRecords() {
  try {
    const records = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    const hasOldFormat = records.some(
      (record) =>
        !Object.hasOwn(record, "proficiencia") &&
        !Object.hasOwn(record, "Proficiência") &&
        !Object.hasOwn(record, "ProficiÃªncia")
    );

    if (hasOldFormat) {
      localStorage.removeItem(STORAGE_KEY);
      storedDataNeedsRefresh = true;
      return [];
    }

    return records;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return [];
  }
}

function saveRecords(records) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function setStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.classList.toggle("error", isError);
}

function hideResults(message) {
  studentResult.innerHTML = "";
  resultsSection.hidden = true;
  setStatus(message);
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

function getProficiency(record) {
  return record.proficiencia ?? record["Proficiência"] ?? record["ProficiÃªncia"] ?? "";
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
    const subject = component.includes("matematica") ? "math" : component.includes("portugues") ? "port" : "";
    const bimester = String(record.bimestre || "1").replace(/\D/g, "").slice(0, 1);

    if (!subject || !["1", "2", "3", "4"].includes(bimester)) {
      return;
    }

    document.querySelector(`#${subject}-score-${bimester}`).textContent = getProficiency(record);
    document.querySelector(`#${subject}-level-${bimester}`).textContent = record.nivel ?? "";
  });

  reportModal.showModal();
}

function normalizeRa(value) {
  return String(value ?? "")
    .trim()
    .replace(/\.0+$/, "")
    .replace(/[\s.\-]/g, "");
}

function searchByRa() {
  const ra = normalizeRa(searchInput.value);
  if (!ra) {
    hideResults("Digite o RA do aluno para realizar a busca.");
    return;
  }

  if (allRecords.length === 0) {
    hideResults("Nenhuma planilha foi importada. Converta a planilha antes de buscar.");
    return;
  }

  const matches = allRecords.filter((record) => normalizeRa(record.ra) === ra);
  renderRecords(matches);
}

async function readApiResponse(response) {
  const text = await response.text();
  if (!text) {
    throw new Error(
      "A API nao retornou dados. Verifique se o servidor FastAPI esta rodando em http://127.0.0.1:8000."
    );
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("A API retornou uma resposta invalida. Verifique o terminal do servidor FastAPI.");
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const file = fileInput.files[0];
  if (!file) {
    setStatus("Selecione uma planilha antes de converter.", true);
    return;
  }

  const formData = new FormData();
  formData.append("file", file);

  const submitButton = form.querySelector("button[type='submit']");
  submitButton.disabled = true;
  setStatus("Convertendo planilha...");

  try {
    const response = await fetch("/api/convert", {
      method: "POST",
      body: formData,
    });
    const payload = await readApiResponse(response);

    if (!response.ok) {
      throw new Error(payload.detail || "Erro ao converter a planilha.");
    }

    allRecords = payload.records;
    storedDataNeedsRefresh = false;
    saveRecords(allRecords);
    searchInput.value = "";
    hideResults(`Planilha convertida com sucesso. ${allRecords.length} registros importados. Digite o RA para buscar.`);
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    submitButton.disabled = false;
  }
});

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  searchByRa();
});

searchInput.addEventListener("input", () => {
  if (resultsSection.hidden) {
    return;
  }
  hideResults("Clique em Buscar para consultar o RA informado.");
});

clearButton.addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  allRecords = [];
  fileInput.value = "";
  searchInput.value = "";
  hideResults("Digite o RA do aluno para realizar a busca.");
});

closeModalButton.addEventListener("click", () => reportModal.close());
printReportButton.addEventListener("click", () => window.print());

reportModal.addEventListener("click", (event) => {
  if (event.target === reportModal) {
    reportModal.close();
  }
});

hideResults(
  storedDataNeedsRefresh
    ? "Os dados antigos foram atualizados. Converta a planilha novamente para carregar as proficiências."
    : "Digite o RA do aluno para realizar a busca."
);

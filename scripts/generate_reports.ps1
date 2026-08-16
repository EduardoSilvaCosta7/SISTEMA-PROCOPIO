$ErrorActionPreference = "Stop"

$inputPath = "C:\Users\Administrator\Downloads\Resultado_SERAp_Junho_1_bimestre.xlsm"
$projectRoot = Split-Path $PSScriptRoot -Parent
$privateReports = Join-Path $projectRoot "private\reports"
New-Item -ItemType Directory -Force -Path $privateReports | Out-Null
$outputPath = Join-Path $privateReports "relatorios_resultado_prova.html"
$schoolNameHtml = "EMEF Proc&oacute;pio Ferreira"
$testNameHtml = "Saberes e Aprendizagens da SME-SP"
$periodTextHtml = "1&ordm;, 2&ordm;, 3&ordm; e 4&ordm; Bimestre de 2026"
$currentBimesterIndex = 0

Add-Type -AssemblyName System.IO.Compression.FileSystem

function Read-ZipEntryText {
    param(
        [System.IO.Compression.ZipArchive] $Zip,
        [string] $EntryName
    )

    $entry = $Zip.GetEntry($EntryName)
    if ($null -eq $entry) {
        throw "Entrada não encontrada no arquivo Excel: $EntryName"
    }

    $stream = $entry.Open()
    try {
        $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::UTF8)
        return $reader.ReadToEnd()
    }
    finally {
        $stream.Dispose()
    }
}

function Get-ColumnIndex {
    param([string] $CellReference)

    $letters = ([regex]::Match($CellReference, "^[A-Z]+")).Value
    $number = 0
    foreach ($char in $letters.ToCharArray()) {
        $number = ($number * 26) + ([int][char]$char - [int][char]"A" + 1)
    }
    return $number
}

function Get-CellText {
    param(
        [System.Xml.XmlElement] $Cell,
        [string[]] $SharedStrings
    )

    if ($Cell.t -eq "inlineStr") {
        return [string]$Cell.is.InnerText
    }

    if ($null -eq $Cell.v) {
        return ""
    }

    $value = [string]$Cell.v
    if ($Cell.t -eq "s") {
        return $SharedStrings[[int]$value]
    }

    return $value
}

function ConvertTo-HtmlText {
    param([object] $Value)

    return [System.Net.WebUtility]::HtmlEncode([string]$Value)
}

function ConvertTo-HeaderKey {
    param([string] $Value)

    $normalized = $Value.Normalize([System.Text.NormalizationForm]::FormD)
    $builder = [System.Text.StringBuilder]::new()
    foreach ($char in $normalized.ToCharArray()) {
        $category = [System.Globalization.CharUnicodeInfo]::GetUnicodeCategory($char)
        if ($category -ne [System.Globalization.UnicodeCategory]::NonSpacingMark -and $char -match "[A-Za-z0-9]") {
            [void]$builder.Append(([string]$char).ToLowerInvariant())
        }
    }
    return $builder.ToString()
}

if (-not (Test-Path -LiteralPath $inputPath)) {
    throw "Planilha não encontrada: $inputPath"
}

$zip = [System.IO.Compression.ZipFile]::OpenRead($inputPath)
try {
    [xml]$sharedXml = Read-ZipEntryText -Zip $zip -EntryName "xl/sharedStrings.xml"
    $sharedStrings = @(
        foreach ($item in $sharedXml.sst.si) {
            [string]$item.InnerText
        }
    )

    [xml]$sheetXml = Read-ZipEntryText -Zip $zip -EntryName "xl/worksheets/sheet1.xml"
    $rows = @($sheetXml.worksheet.sheetData.row)

    $headerByColumn = @{}
    foreach ($cell in @($rows[0].c)) {
        $headerByColumn[(Get-ColumnIndex $cell.r)] = (Get-CellText -Cell $cell -SharedStrings $sharedStrings).Trim()
    }

    $columnByHeader = @{}
    foreach ($column in $headerByColumn.Keys) {
        $columnByHeader[(ConvertTo-HeaderKey $headerByColumn[$column])] = $column
    }

    $requiredHeaders = @("anoescola", "turma", "alunora", "nomealuno", "componente", "proficiencia", "nivel")
    foreach ($header in $requiredHeaders) {
        if (-not $columnByHeader.ContainsKey($header)) {
            throw "Coluna obrigatória ausente: $header"
        }
    }

    $records = New-Object System.Collections.Generic.List[object]
    foreach ($row in ($rows | Select-Object -Skip 1)) {
        $values = @{}
        foreach ($cell in @($row.c)) {
            $values[(Get-ColumnIndex $cell.r)] = Get-CellText -Cell $cell -SharedStrings $sharedStrings
        }

        $name = ([string]$values[$columnByHeader["nomealuno"]]).Trim()
        if ([string]::IsNullOrWhiteSpace($name)) {
            continue
        }

        $records.Add([pscustomobject]@{
            Ano          = ([string]$values[$columnByHeader["anoescola"]]).Trim()
            Turma        = ([string]$values[$columnByHeader["turma"]]).Trim()
            RA           = ([string]$values[$columnByHeader["alunora"]]).Trim()
            Nome         = ([string]$values[$columnByHeader["nomealuno"]]).Trim()
            Componente   = ([string]$values[$columnByHeader["componente"]]).Trim()
            ComponenteKey = ConvertTo-HeaderKey ([string]$values[$columnByHeader["componente"]])
            Proficiencia = ([string]$values[$columnByHeader["proficiencia"]]).Trim()
            Nivel        = ([string]$values[$columnByHeader["nivel"]]).Trim()
        })
    }
}
finally {
    $zip.Dispose()
}

$students = $records |
    Group-Object RA, Nome, Turma |
    Sort-Object {
        $first = $_.Group[0]
        "{0}|{1}" -f $first.Turma, $first.Nome
    }

$disciplines = @(
    [pscustomobject]@{ LabelHtml = "Portugu&ecirc;s"; Match = "portugues|linguaportuguesa" },
    [pscustomobject]@{ LabelHtml = "Matem&aacute;tica"; Match = "matematica" }
)
$bimestersHtml = @("1&ordm; Bim", "2&ordm; Bim", "3&ordm; Bim", "4&ordm; Bim")

$html = [System.Text.StringBuilder]::new()
[void]$html.AppendLine("<!doctype html>")
[void]$html.AppendLine("<html lang=""pt-BR"">")
[void]$html.AppendLine("<head>")
[void]$html.AppendLine("  <meta charset=""utf-8"">")
[void]$html.AppendLine("  <title>Relat&oacute;rios de Resultado de Prova</title>")
[void]$html.AppendLine("  <style>")
[void]$html.AppendLine("    * { box-sizing: border-box; }")
[void]$html.AppendLine("    body { margin: 0; background: #e9eef3; color: #000; font-family: Arial, Helvetica, sans-serif; }")
[void]$html.AppendLine("    .page { width: 210mm; min-height: 297mm; margin: 0 auto 16px; padding: 14mm 10mm; background: #fff; page-break-after: always; }")
[void]$html.AppendLine("    .school { margin: 0 0 14px; font-size: 25px; font-style: italic; font-weight: 700; }")
[void]$html.AppendLine("    h1 { margin: 0 0 20px; text-align: center; font-size: 34px; text-decoration: underline; }")
[void]$html.AppendLine("    .info { margin: 0; font-size: 30px; line-height: 1.35; }")
[void]$html.AppendLine("    .info strong { font-weight: 800; }")
[void]$html.AppendLine("    .student { margin: 50px 0 48px; font-size: 30px; font-weight: 800; }")
[void]$html.AppendLine("    .name-line { display: inline-block; min-width: 470px; border-bottom: 3px solid #000; font-weight: 700; }")
[void]$html.AppendLine("    table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 24px; }")
[void]$html.AppendLine("    th, td { border: 2px solid #000; padding: 8px 10px; text-align: center; vertical-align: middle; }")
[void]$html.AppendLine("    th { background: #bdd7ee; font-weight: 800; }")
[void]$html.AppendLine("    td.discipline { width: 24%; font-weight: 800; }")
[void]$html.AppendLine("    td.level { text-align: left; }")
[void]$html.AppendLine("    @media print { body { background: #fff; } .page { margin: 0; page-break-after: always; } }")
[void]$html.AppendLine("  </style>")
[void]$html.AppendLine("</head>")
[void]$html.AppendLine("<body>")

foreach ($studentGroup in $students) {
    $studentRecords = @($studentGroup.Group)
    $student = $studentRecords[0]

    [void]$html.AppendLine("  <section class=""page"">")
    [void]$html.AppendLine("    <p class=""school"">$schoolNameHtml</p>")
    [void]$html.AppendLine("    <h1>Resultado de prova</h1>")
    [void]$html.AppendLine("    <p class=""info""><strong>Nome da prova:</strong> $testNameHtml</p>")
    [void]$html.AppendLine("    <p class=""info""><strong>Referente ao per&iacute;odo:</strong> $periodTextHtml</p>")
    [void]$html.AppendLine("    <p class=""student"">Turma: $(ConvertTo-HtmlText $student.Turma) - Nome:<span class=""name-line"">$(ConvertTo-HtmlText $student.Nome)</span></p>")
    [void]$html.AppendLine("    <table>")
    [void]$html.AppendLine("      <thead>")
    [void]$html.AppendLine("        <tr><th>Disciplina</th><th>Bimestre</th><th>Profici&ecirc;ncia</th><th>Profici&ecirc;ncia</th></tr>")
    [void]$html.AppendLine("      </thead>")
    [void]$html.AppendLine("      <tbody>")

    foreach ($discipline in $disciplines) {
        $disciplineRecords = @($studentRecords | Where-Object { $_.ComponenteKey -match $discipline.Match })
        for ($i = 0; $i -lt $bimestersHtml.Count; $i++) {
            $bimesterHtml = $bimestersHtml[$i]
            $score = ""
            $level = ""
            if ($i -eq $currentBimesterIndex -and $disciplineRecords.Count -gt 0) {
                $score = $disciplineRecords[0].Proficiencia
                $level = $disciplineRecords[0].Nivel
            }

            [void]$html.Append("        <tr>")
            if ($i -eq 0) {
                [void]$html.Append("<td class=""discipline"" rowspan=""4"">$($discipline.LabelHtml)</td>")
            }
            [void]$html.Append("<td>$bimesterHtml</td>")
            [void]$html.Append("<td>$(ConvertTo-HtmlText $score)</td>")
            [void]$html.Append("<td class=""level"">$(ConvertTo-HtmlText $level)</td>")
            [void]$html.AppendLine("</tr>")
        }
    }

    [void]$html.AppendLine("      </tbody>")
    [void]$html.AppendLine("    </table>")
    [void]$html.AppendLine("  </section>")
}

[void]$html.AppendLine("</body>")
[void]$html.AppendLine("</html>")

[System.IO.File]::WriteAllText($outputPath, $html.ToString(), [System.Text.UTF8Encoding]::new($false))

[pscustomobject]@{
    Arquivo = $outputPath
    Registros = $records.Count
    Alunos = $students.Count
} | Format-List

// The competition upload's file reader (admin, ExcelUpload_beach): an .xlsx
// sheet or a CSV becomes one object per data row, keyed by the header row.
import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { parseExcel } from '../../utils_beach/excelParser_beach'

// A one-sheet workbook with inline strings, as a spreadsheet app saves it
async function xlsxFile(rows, name = 'matches.xlsx') {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  const col = (i) => String.fromCharCode(65 + i)
  const sheetRows = rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => typeof v === 'number'
    ? `<c r="${col(ci)}${ri + 1}"><v>${v}</v></c>`
    : `<c r="${col(ci)}${ri + 1}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`).join('')}</row>`).join('')
  const zip = new JSZip()
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>')
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
  zip.file('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Matches" sheetId="1" r:id="rId1"/></sheets></workbook>')
  zip.file('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>')
  zip.file('xl/worksheets/sheet1.xml', `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`)
  const bytes = await zip.generateAsync({ type: 'uint8array' })
  return new File([bytes], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

describe('parseExcel', () => {
  it('reads an .xlsx sheet: one object per row, umlauts kept, numbers as numbers', async () => {
    const file = await xlsxFile([
      ['Match', 'Team 1', 'Team 2', 'Court'],
      ['M1', 'Müller / Weber', 'Schmid / Lüthi', 1],
      ['M2', 'Fässler / Zürcher', 'Dubois / Bühler', 2]
    ])
    expect(await parseExcel(file)).toEqual([
      { Match: 'M1', 'Team 1': 'Müller / Weber', 'Team 2': 'Schmid / Lüthi', Court: 1 },
      { Match: 'M2', 'Team 1': 'Fässler / Zürcher', 'Team 2': 'Dubois / Bühler', Court: 2 }
    ])
  })

  it('a sheet with only its header row has no matches', async () => {
    expect(await parseExcel(await xlsxFile([['Match', 'Team 1']]))).toEqual([])
  })

  it('reads a CSV the same way, quoted commas and quotes included', async () => {
    const csv = 'Match,Team 1,Team 2\r\nM1,"Müller, A / Weber",Schmid / Lüthi\r\nM2,"Say ""hi""",X\r\n'
    expect(await parseExcel(new File([csv], 'matches.csv', { type: 'text/csv' }))).toEqual([
      { Match: 'M1', 'Team 1': 'Müller, A / Weber', 'Team 2': 'Schmid / Lüthi' },
      { Match: 'M2', 'Team 1': 'Say "hi"', 'Team 2': 'X' }
    ])
  })
})

// Owner 19.11.2026: the competition upload imports a person's licence (its
// Licence column), never a date of birth
describe('mapExcelRowToCompMatch: licences', () => {
  const row = {
    Competition: 'Beach Tour Musterdorf', Gender: 'Men', Phase: 'Main Draw', Round: 'Pool Play',
    'T1 Player 1 #': '1', 'T1 Player 1 Last': 'Muster', 'T1 Player 1 First': 'Max', 'T1 Player 1 Licence': 100101,
    'T1 Player 2 #': '2', 'T1 Player 2 Last': 'Beispiel', 'T1 Player 2 First': 'Ben', 'T1 Player 2 Licence': '14.03.2008',
    'T2 Player 1 #': '1', 'T2 Player 1 Last': 'Probst', 'T2 Player 1 First': 'Paul', 'T2 Player 1 Licence': ' 100 201 ',
    'T2 Player 2 #': '2', 'T2 Player 2 Last': 'Vorlage', 'T2 Player 2 First': 'Vera', 'T2 Player 2 Licence': new Date(Date.UTC(2008, 2, 14)),
    '1st Referee Last': 'Schiedsmann', '1st Referee First': 'Hans', '1st Referee Licence': '200301',
    'Scorer Last': 'Tafel', 'Scorer First': 'Tom', 'Scorer Licence': '2008-03-14',
    'Date of birth': '14.03.2008'
  }

  it('players and officials carry the licence; a date in the column is dropped', async () => {
    const { mapExcelRowToCompMatch } = await import('../../utils_beach/excelParser_beach')
    const m = mapExcelRowToCompMatch(row, 'u1')
    expect(m.players_team1.map(p => p.dob)).toEqual(['100101', ''])
    expect(m.players_team2.map(p => p.dob)).toEqual(['100201', ''])
    expect(m.officials.map(o => [o.role, o.dob])).toEqual([['1st referee', '200301'], ['scorer', '']])
    expect(JSON.stringify(m)).not.toMatch(/2008/)
  })

  it('a sheet without a Licence column imports no value', async () => {
    const { mapExcelRowToCompMatch } = await import('../../utils_beach/excelParser_beach')
    const m = mapExcelRowToCompMatch({ Competition: 'X', Gender: 'Women', Phase: 'Main', Round: 'Pool', 'T1 Player 1 Last': 'Muster', 'T1 Player 1 First': 'Mia' }, null)
    expect(m.players_team1).toEqual([{ number: '', first_name: 'Mia', last_name: 'Muster', dob: '', is_captain: false }])
  })
})

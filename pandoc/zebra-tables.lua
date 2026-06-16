-- zebra-tables.lua — alternating row shading for tables in the PDF (LaTeX) output.
--
-- pandoc's LaTeX tables use booktabs (only top/header/bottom rules), so with
-- multi-line cells the rows visually merge. We shade every other body row to make
-- the separations clear. We use colortbl's \cellcolor on each cell (not \rowcolor):
-- \cellcolor sits inside the cell, so it needs no [table] option on xcolor (colortbl
-- loads cleanly alongside the xcolor pandoc already loads) and works in pandoc's
-- p{}-width wrapping columns. Header `\usepackage{colortbl}` and
-- `\definecolor{rowzebra}{...}` come from generar-pdf.sh's preamble.
--
-- Only affects LaTeX/PDF; a no-op for DOCX/HTML. Written to work on pandoc 2.10+.

if not (FORMAT == 'latex' or FORMAT == 'beamer') then
  return {}
end

local function shade_cell(cell)
  local shade = pandoc.RawInline('latex', '\\cellcolor{rowzebra}')
  local blocks = cell.contents
  if blocks == nil or #blocks == 0 then
    cell.contents = { pandoc.Plain({ shade }) }
    return
  end
  local first = blocks[1]
  if first.content ~= nil then            -- Plain / Para: prepend the colour command
    table.insert(first.content, 1, shade)
  else                                    -- other block types: add a leading Plain
    table.insert(blocks, 1, pandoc.Plain({ shade }))
  end
end

function Table(tbl)
  for _, body in ipairs(tbl.bodies) do
    for i, row in ipairs(body.body) do
      if i % 2 == 0 then                  -- shade 2nd, 4th, … data rows
        for _, cell in ipairs(row.cells) do
          shade_cell(cell)
        end
      end
    end
  end
  return tbl
end

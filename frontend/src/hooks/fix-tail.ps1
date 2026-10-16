$lines = Get-Content 'src/hooks/queries.ts'
$s = [string]::Join("`n", $lines)
$marker = '// ---------- Rủi ro & Cơ hội (CR-RISK-OPPORTUNITY-001) ----------'
$i = $s.IndexOf($marker)
if ($i -lt 0) { Write-Error 'marker not found'; exit 1 }
$j = $s.IndexOf('    isPending: saving,', $i)
if ($j -lt 0) { Write-Error 'anchor not found'; exit 1 }

$before = $s.Substring(0, $i)
$originalTail = $s.Substring($j)
$newBlock = $s.Substring($i, $j - $i)
$result = $before + $originalTail + "`n" + $newBlock
$out = $result -split '\n'
Set-Content 'src/hooks/queries.ts' -Value $out

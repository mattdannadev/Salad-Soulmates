$ErrorActionPreference = 'Stop'

$seedPath = Join-Path $PSScriptRoot '..\supabase\seed.sql'
$outputPath = Join-Path $env:TEMP 'salad-soulmates-additive-demo-suite.sql'
$seed = Get-Content -LiteralPath $seedPath -Raw

function Get-SeedSection([string]$startMarker, [string]$endMarker) {
  $start = $seed.IndexOf($startMarker, [System.StringComparison]::Ordinal)
  $end = $seed.IndexOf($endMarker, $start, [System.StringComparison]::Ordinal)
  if ($start -lt 0 -or $end -lt 0) {
    throw "Could not locate required additive demo-data section: $startMarker"
  }
  return $seed.Substring($start, $end - $start)
}

$sampleDates = Get-SeedSection 'create temp table sample_dates' '-- The local demo deliberately'
$orders = Get-SeedSection '-- A fuller local-only customer-order suite' '-- Demo inventory is based'
$purchases = Get-SeedSection '-- Five order-linked inbound POs provide real supplier-delivery rows' 'reset role;'
$workId = Get-SeedSection 'create function pg_temp.sample_work_id' 'create temp table sample_work_days'
$work = Get-SeedSection '-- Every added order has three staged production work orders' '-- END FULL LOCAL DEMO WORK ORDERS'

$script = @"
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
$sampleDates
$orders
$purchases
reset role;
$workId
$work
commit;
"@

Set-Content -LiteralPath $outputPath -Value $script -NoNewline
try {
  Get-Content -LiteralPath $outputPath -Raw |
    docker exec -i supabase_db_salad-soulmates psql -v ON_ERROR_STOP=1 -U postgres -d postgres
} finally {
  Remove-Item -LiteralPath $outputPath -Force -ErrorAction SilentlyContinue
}

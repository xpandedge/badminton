param(
  [string]$ExpectedBranch = "main",
  [switch]$SkipFetch
)

$ErrorActionPreference = "Stop"

function Git([string[]]$Arguments) {
  $result = & git @Arguments 2>&1
  if ($LASTEXITCODE -ne 0) { throw "git $($Arguments -join ' ') failed: $result" }
  return ($result -join "`n").Trim()
}

$root = Git @("rev-parse", "--show-toplevel")
$branch = Git @("branch", "--show-current")
if ($branch -ne $ExpectedBranch) {
  throw "Release refused: expected branch '$ExpectedBranch', found '$branch'."
}

$status = Git @("status", "--porcelain=v1")
if ($status) {
  throw "Release refused: working tree is dirty. Preserve the changes before releasing.`n$status"
}

if (-not $SkipFetch) { Git @("fetch", "origin", $ExpectedBranch, "--quiet") | Out-Null }

$head = Git @("rev-parse", "HEAD")
$remote = Git @("rev-parse", "origin/$ExpectedBranch")
if ($head -ne $remote) {
  throw "Release refused: HEAD ($head) is not the pushed origin/$ExpectedBranch ($remote)."
}

Write-Output "RELEASE_PREFLIGHT=READY"
Write-Output "REPOSITORY=$root"
Write-Output "BRANCH=$branch"
Write-Output "COMMIT=$head"

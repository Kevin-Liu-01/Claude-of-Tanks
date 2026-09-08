# Apply the data-i18n attributes to the public nav across all static HTML pages.
$ErrorActionPreference = 'Stop'
$files = @(
  'docs-ai.html', 'docs-audio.html', 'docs-build.html', 'docs-interface.html',
  'docs-models.html', 'docs-multiplayer.html', 'docs-performance.html',
  'docs-rendering.html', 'docs-simulation.html', 'docs-studio.html',
  'docs-vehicles.html', 'docs-worlds.html', 'index.html', 'studio.html'
)
foreach ($f in $files) {
  if (-not (Test-Path $f)) { continue }
  $c = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8)
  $orig = $c
  # brand link
  $c = $c -replace 'class="public-nav__brand" href="/home" aria-label="Claude of Tanks home"><img src="/brand/logo-mark.svg" alt=""><span>Claude <b>of Tanks</b></span>',
                     'class="public-nav__brand" href="/home" data-i18n-aria-label="publicNav.brandAria"><img src="/brand/logo-mark.svg" alt=""><span data-i18n="publicNav.brand">Claude <b>of Tanks</b></span>'
  # nav links
  $c = $c -replace 'alt="">Home</a>', 'alt=""><span data-i18n="publicNav.home">Home</span></a>'
  $c = $c -replace 'alt="">Studio</a>', 'alt=""><span data-i18n="publicNav.studio">Studio</span></a>'
  $c = $c -replace 'alt="">Tank Gallery</a>', 'alt=""><span data-i18n="publicNav.gallery">Tank Gallery</span></a>'
  $c = $c -replace 'alt="">Docs</a>', 'alt=""><span data-i18n="publicNav.docs">Docs</span></a>'
  # github
  $c = $c -replace 'aria-label="Claude of Tanks on GitHub"><span class="public-nav__github-label">GitHub</span>',
                     'data-i18n-aria-label="publicNav.githubAria"><span class="public-nav__github-label" data-i18n="publicNav.githubLabel">GitHub</span>'
  # play now
  $c = $c -replace 'aria-hidden="true"></span>Play Now</a>', 'aria-hidden="true"></span><span data-i18n="publicNav.playNow">Play Now</span></a>'
  if ($c -ne $orig) {
    [System.IO.File]::WriteAllText($f, $c, [System.Text.Encoding]::UTF8)
    Write-Host "Patched $f"
  } else {
    Write-Host "No change in $f"
  }
}

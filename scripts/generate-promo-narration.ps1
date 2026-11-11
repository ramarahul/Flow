$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$flowAudioDirectory = Join-Path $PSScriptRoot '../.output/video/audio'
New-Item -ItemType Directory -Path $flowAudioDirectory -Force | Out-Null
$flowLines = @(
  'Too many tabs. Too many distractions?',
  'Meet Flow. A focus timer that helps you settle into work.',
  'Choose your time, and block the websites that pull you away.',
  'Give each task a daily goal. Make time for what matters.',
  'See where your time goes, with clear focus statistics.',
  'Your data stays on your device. No account. No ads.',
  'Open Flow. Start your timer. Find your focus.'
)
$flowVoice = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $flowVoice.SelectVoice('Microsoft Zira Desktop')
  $flowVoice.Rate = 0
  for ($flowLineIndex = 0; $flowLineIndex -lt $flowLines.Length; $flowLineIndex++) {
    $flowVoice.SetOutputToWaveFile((Join-Path $flowAudioDirectory "$flowLineIndex.wav"))
    $flowVoice.Speak($flowLines[$flowLineIndex])
    $flowVoice.SetOutputToNull()
  }
} finally {
  $flowVoice.Dispose()
}

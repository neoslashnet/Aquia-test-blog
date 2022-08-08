function enable()  {
  DarkReader.setFetchMethod(window.fetch)
  DarkReader.enable();
  localStorage.setItem('dark-mode', 'true');
}

function disable() {
  DarkReader.disable();
  localStorage.setItem('dark-mode', 'false');
}

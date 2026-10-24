for (const button of document.querySelectorAll('[data-preview]')) {
  button.addEventListener('click', () => {
    for (const option of document.querySelectorAll('[data-preview]')) option.setAttribute('aria-pressed', String(option === button));
    const dark = button.dataset.preview === 'dark';
    const image = document.querySelector('#app-preview');
    image.src = dark ? 'assets/dark-preview.png' : 'assets/workspace-preview.png';
    image.alt = `ArchJet ${dark ? 'dark' : 'light'} workspace showing sample documents and print settings`;
  });
}
for (const button of document.querySelectorAll('[data-copy]')) {
  button.addEventListener('click', async () => {
    const text = document.getElementById(button.dataset.copy).textContent;
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = 'Copied';
      document.querySelector('#copy-status').textContent = 'Installation commands copied.';
    } catch {
      button.textContent = 'Select commands';
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(document.getElementById(button.dataset.copy));
      selection.removeAllRanges(); selection.addRange(range);
      document.querySelector('#copy-status').textContent = 'Commands selected. Copy them with your keyboard.';
    }
  });
}

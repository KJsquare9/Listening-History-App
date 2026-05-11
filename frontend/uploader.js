export function bindUploader({ dropzone, input, statusPill, fileName, onFile, onDemo }) {
  const setDragging = (isDragging) => {
    dropzone.classList.toggle("is-dragging", isDragging);
  };

  const setStatus = (message) => {
    statusPill.textContent = message;
  };

  const openPicker = () => input.click();

  dropzone.addEventListener("click", (event) => {
    const action = event.target?.dataset?.action;
    if (action === "browse") {
      openPicker();
      return;
    }

    if (event.target === input) {
      return;
    }

    if (event.target.closest("button")?.dataset?.action === "demo") {
      onDemo();
      return;
    }

    openPicker();
  });

  dropzone.addEventListener("dragenter", (event) => {
    event.preventDefault();
    setDragging(true);
  });

  dropzone.addEventListener("dragover", (event) => {
    event.preventDefault();
    setDragging(true);
  });

  dropzone.addEventListener("dragleave", () => setDragging(false));

  dropzone.addEventListener("drop", (event) => {
    event.preventDefault();
    setDragging(false);
    const [file] = event.dataTransfer?.files ?? [];
    if (file) {
      fileName.textContent = file.name;
      setStatus(`Queued ${file.name}`);
      onFile(file);
    }
  });

  input.addEventListener("change", () => {
    const [file] = input.files ?? [];
    if (file) {
      fileName.textContent = file.name;
      setStatus(`Queued ${file.name}`);
      onFile(file);
    }
  });

  return {
    setStatus,
    setFileName(value) {
      fileName.textContent = value;
    },
  };
}

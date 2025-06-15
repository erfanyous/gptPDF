document.getElementById("download").addEventListener("click", async () => {
  const button = document.getElementById("download");
  const status = document.getElementById("status");

  const fontSize = document.getElementById("fontSize").value;

  // Ask for filename
  let filename = prompt(
    "Enter filename for the PDF (without .pdf):",
    "chatgpt_conversation"
  );
  if (!filename) {
    status.textContent = "PDF generation cancelled.";
    return;
  }
  filename = filename.trim() + ".pdf";

  // Show progress
  button.disabled = true;
  status.textContent = "Generating PDF...";

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Inject html2pdf
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["html2pdf.bundle.min.js"],
  });

  // Inject logic to generate the PDF
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    args: [filename, fontSize],
    func: (filename, fontSize) => {
      const container = document.createElement("div");
      container.style.padding = "20px";
      container.style.fontFamily = "Arial, sans-serif";
      container.style.fontSize = fontSize;
      container.style.lineHeight = "1.6";

      const userMessages = document.querySelectorAll(
        ".whitespace-pre-wrap:not(.dark\\:whitespace-pre-wrap)"
      );
      const botResponses = document.querySelectorAll(
        ".markdown.prose.w-full.break-words.dark\\:prose-invert"
      );

      const cleanHTML = (html) => {
        const temp = document.createElement("div");
        temp.innerHTML = html;

        // Remove unwanted UI elements like buttons or copy/edit icons
        temp
          .querySelectorAll(
            "button, .copy-button, .edit-button, [aria-label='Copy code']"
          )
          .forEach((el) => el.remove());

        temp.querySelectorAll("*").forEach((el) => {
          el.removeAttribute("class");
          el.removeAttribute("style");

          // Flatten headings
          if (/^H[1-6]$/.test(el.tagName)) {
            const div = document.createElement("div");
            div.innerHTML = el.innerHTML;
            div.style.fontWeight = "normal";
            div.style.fontSize = fontSize;
            el.replaceWith(div);
          }

          // Default style
          el.style.fontWeight = "normal";
          el.style.fontSize = fontSize;
        });

        // // Replace <strong> and <b> with span
        // temp.querySelectorAll("b, strong").forEach((el) => {
        //   const span = document.createElement("span");
        //   span.innerHTML = el.innerHTML;
        //   span.style.fontWeight = "normal";
        //   span.style.fontSize = fontSize;
        //   el.replaceWith(span);
        // });

        // Style <pre> and <code> blocks
        temp.querySelectorAll("pre, code").forEach((el) => {
          el.style.color = "blue";
          // el.style.padding = "10px";
          // el.style.borderRadius = "4px";
          // el.style.border = "1px solid #ddd";
          // el.style.display = "block";
          // el.style.fontFamily = "monospace";
          // el.style.whiteSpace = "pre-wrap";
          // el.style.wordBreak = "break-word";
          // el.style.fontSize = "12pt";
        });

        // beatify tables with CSS and adds border
        temp.querySelectorAll("table").forEach((el) => {
          el.style.width = "100%";
          el.style.borderCollapse = "collapse";
          el.style.marginBottom = "20px";
          el.querySelectorAll("th, td").forEach((cell) => {
            cell.style.border = "1px solid #ddd";
            cell.style.padding = "8px";
            cell.style.textAlign = "left";
          });
          el.querySelectorAll("th").forEach((th) => {
            th.style.backgroundColor = "#f2f2f2";
            th.style.fontWeight = "bold";
          });
        });

        return temp.innerHTML;
      };

      const count = Math.min(userMessages.length, botResponses.length);
      for (let i = 0; i < count; i++) {
        const qWrapper = document.createElement("div");
        qWrapper.style.margin = "20px 0";
        qWrapper.style.color = "red";

        const qPrefix = document.createElement("span");
        qPrefix.textContent = `Q${i + 1}: `;
        qPrefix.style.fontWeight = "bold";
        qPrefix.style.fontSize = fontSize;

        const qContent = document.createElement("span");
        qContent.innerHTML = cleanHTML(userMessages[i].innerHTML);
        qContent.style.fontSize = fontSize;

        qWrapper.appendChild(qPrefix);
        qWrapper.appendChild(qContent);
        container.appendChild(qWrapper);

        const aWrapper = document.createElement("div");
        aWrapper.style.margin = "10px 0 24px 0";
        aWrapper.style.color = "black";
        aWrapper.style.fontSize = fontSize;

        const aContent = document.createElement("span");
        aContent.innerHTML = cleanHTML(botResponses[i].innerHTML);
        aContent.style.fontSize = fontSize;

        aWrapper.appendChild(aContent);
        container.appendChild(aWrapper);
      }

      document.body.appendChild(container);

      html2pdf()
        .set({
          margin: 0.5,
          filename: filename,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: "in", format: "letter", orientation: "portrait" },
          pagebreak: { mode: ["avoid-all", "css", "legacy"] },
        })
        .from(container)
        .save()
        .then(() => {
          container.remove();
          chrome.runtime.sendMessage({ type: "pdfComplete" });
        });
    },
  });

  // Listen for PDF complete signal
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "pdfComplete") {
      button.disabled = false;
      status.textContent = "PDF download complete.";
      setTimeout(() => (status.textContent = ""), 3000);
    }
  });
});

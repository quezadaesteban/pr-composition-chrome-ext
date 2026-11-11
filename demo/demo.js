// Demo-only extension API stand-in. Never shipped in dist/.
const saved = {},
  listeners = [];
window.chrome = {
  storage: {
    local: {
      async get(key) {
        return { [key]: saved[key] };
      },
      async set(value) {
        Object.assign(saved, value);
        for (const listener of listeners)
          listener(
            Object.fromEntries(
              Object.entries(value).map(([key, newValue]) => [
                key,
                { newValue },
              ]),
            ),
            "local",
          );
      },
    },
    onChanged: {
      addListener(listener) {
        listeners.push(listener);
      },
      removeListener(listener) {
        const index = listeners.indexOf(listener);
        if (index >= 0) listeners.splice(index, 1);
      },
    },
  },
};
const lastFile = document.getElementById("diff-docs");
for (const control of document.querySelectorAll(".viewed-toggle")) {
  control.addEventListener("click", () => {
    const viewed = control.getAttribute("aria-pressed") !== "true";
    control.setAttribute("aria-pressed", String(viewed));
    control.textContent = viewed ? "Viewed" : "Not Viewed";
  });
}
document.getElementById("toggle-file").addEventListener("click", (event) => {
  if (lastFile.isConnected) {
    lastFile.remove();
    event.target.textContent = "Load remaining file";
  } else {
    document.querySelector(".diff-list").append(lastFile);
    event.target.textContent = "Simulate partial data";
  }
});

// The boss chooser. The four fights share no room in the game, so the vault
// door does not lead to one: it asks which boss, and the choice opens that
// boss's setup window.
import { awakenedKind, bosses } from "./bosses.js";

// Colours and fonts come from the application's stylesheet.
const style = `
.dt2-chooser { width: min(420px, 92vw); padding: 16px; color: inherit; background: var(--color-bg-solid, #1e1812);
  border: 1px solid var(--modal-card-border, #5d5245); border-radius: var(--modal-radius, 6px);
  font-family: "RuneScape Bold 12", sans-serif; }
.dt2-chooser::backdrop { background: var(--modal-backdrop, rgb(0 0 0 / 0.6)); }
.dt2-chooser h2 { margin: 0 0 2px; }
.dt2-chooser p { margin: 0 0 12px; opacity: 0.7; }
.dt2-chooser li { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
.dt2-chooser ul { margin: 0 0 14px; padding: 0; }
.dt2-chooser i { width: 10px; height: 28px; border-radius: 2px; }
.dt2-chooser span { flex: 1; }
.dt2-chooser small { display: block; opacity: 0.6; }
`;

// Hue, saturation and lightness of 0 to 255 as a CSS colour.
const css = ([h, s, l]) => `hsl(${(h * 360) / 255} ${(s * 100) / 255}% ${(l * 100) / 255}%)`;

// Shows the chooser. `select({ encounterKind, displayName, description })`
// opens the setup window of the chosen fight.
export function chooseBoss(select) {
  const fights = new Map();
  const button = (kind, displayName, label, boss) => {
    fights.set(kind, { encounterKind: kind, displayName, description: boss.place + ". Drops " + boss.element + " quartz." });
    return `<button class="osrs-btn osrs-btn--default" value="${kind}">${label}</button>`;
  };
  const dialog = document.createElement("dialog");
  dialog.className = "dt2-chooser";
  dialog.innerHTML = `<style>${style}</style>
    <form method="dialog">
      <h2>The Forgotten Four</h2>
      <p>Desert Treasure II. Choose a boss.</p>
      <ul>${bosses.map((boss) => `
        <li>
          <i style="background: ${css(boss.colour)}"></i>
          <span>${boss.name}<small>${boss.place}</small></span>
          ${button(boss.kind, boss.name, "Fight", boss)}
          ${button(awakenedKind(boss.kind), boss.name + " (Awakened)", "Awakened", boss)}
        </li>`).join("")}
      </ul>
      <button class="osrs-btn osrs-btn--ghost" value="">Close</button>
    </form>`;
  // A button closes the dialog with its value; Escape closes it with none.
  dialog.addEventListener("close", () => {
    dialog.remove();
    const fight = fights.get(dialog.returnValue);
    if (fight) select(fight);
  });
  document.body.append(dialog);
  dialog.showModal();
}

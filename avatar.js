// avatar.js - small profile photos, kept inside the database (no Storage needed)

// Only accept the exact kind of picture this app makes itself.
const OK = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;
export const validPhoto = (s) => typeof s === "string" && s.length < 200000 && OK.test(s);

// Shows the photo inside a round avatar, or the fallback text (initial or emoji) when there is none.
export function setAvatar(el, photo, fallback) {
  if (validPhoto(photo)) {
    el.style.backgroundImage = 'url("' + photo + '")';
    el.style.backgroundSize = "cover";
    el.style.backgroundPosition = "center";
    el.textContent = "";
  } else {
    el.style.backgroundImage = "";
    el.textContent = fallback || "";
  }
}

// Opens the phone's photo picker, crops to a square and shrinks to 256 pixels.
// Returns the small picture as text, or null if nothing was chosen.
export function pickPhoto() {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.style.display = "none";
    let done = false;
    input.addEventListener("change", () => {
      done = true;
      const file = input.files && input.files[0];
      input.remove();
      if (!file) { resolve(null); return; }
      if (!file.type.startsWith("image/")) { reject(new Error("Please choose a photo")); return; }
      if (file.size > 25 * 1024 * 1024) { reject(new Error("That photo is too big")); return; }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const side = Math.min(img.naturalWidth, img.naturalHeight);
          const sx = (img.naturalWidth - side) / 2, sy = (img.naturalHeight - side) / 2;
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = 256;
          canvas.getContext("2d").drawImage(img, sx, sy, side, side, 0, 0, 256, 256);
          let out = canvas.toDataURL("image/jpeg", 0.82);
          if (out.length > 120000) out = canvas.toDataURL("image/jpeg", 0.6);
          URL.revokeObjectURL(url);
          validPhoto(out) ? resolve(out) : reject(new Error("Could not use that photo"));
        } catch (e) { reject(new Error("Could not use that photo")); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not open that photo")); };
      img.src = url;
    });
    // If the picker is closed without choosing, carry on quietly.
    input.addEventListener("cancel", () => { if (!done) { input.remove(); resolve(null); } });
    document.body.append(input);
    input.click();
  });
}

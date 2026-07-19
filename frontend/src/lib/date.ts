export function formatDateBR(value) {
  if (!value) return "";
  const [datePart] = String(value).split("T");
  const [year, month, day] = datePart.split("-");
  if (!year || !month || !day) return String(value);
  return `${day}/${month}/${year}`;
}

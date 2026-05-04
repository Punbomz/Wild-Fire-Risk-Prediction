export default function RegionFilter({ label, options, value, onChange }) {
  return (
    <div className="filter">
      <label>{label}</label>

      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="All">All</option>
        {options.map((opt, i) => (
          <option key={i} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}
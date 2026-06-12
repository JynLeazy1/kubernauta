export default function Loading({ fullPage = false }) {
  return (
    <div
      className={`loading${fullPage ? ' loading--fullpage' : ''}`}
      role="status"
      aria-label="Loading"
    >
      <div className="loading-spinner">
        <img src="/favicon.svg" alt="Loading" />
      </div>
    </div>
  )
}

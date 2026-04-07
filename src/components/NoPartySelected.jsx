function NoPartySelected({
  message = 'Select a party to begin.'
}) {
  return (
    <p className="hint-row no-party-state">{message}</p>
  );
}

export default NoPartySelected;


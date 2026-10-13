// Convert a wall clock in the restaurant zone, independent of the browser zone.
// Ambiguous DST times require an explicit offset; gaps are rejected.
export function restaurantDate(value: string, zone: string): string {
  return new Intl.DateTimeFormat('sv-SE',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
}
export function restaurantUtc(value: string, zone: string): string {
  const parts = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!parts) throw new Error('Укажите дату и время ресторана.');
  const wall = Date.UTC(+parts[1],+parts[2]-1,+parts[3],+parts[4],+parts[5]);
  const formatter = new Intl.DateTimeFormat('sv-SE',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const matches: number[]=[];
  for(let offset=-14*60;offset<=14*60;offset+=15){const at=wall-offset*60000;if(formatter.format(new Date(at)).replace(' ','T')===value)matches.push(at);}
  if(matches.length!==1)throw new Error('Время пропущено или неоднозначно из-за перевода часов. Выберите другое время.');
  return new Date(matches[0]).toISOString();
}

import type {Analytics} from './types';

export function insightSummary(a:Analytics) {
  const total=a.ordersAccepted+a.ordersRejected;
  const rejectionRate=total ? a.ordersRejected/total*100 : 0;
  const shortages=[...a.products].filter(p=>p.shortageCount>0).sort((x,y)=>y.shortageCount-x.shortageCount||x.name.localeCompare(y.name,'ru'));
  const losses=a.products.filter(p=>p.wasted>0);
  const title=!total&&!a.lossBatches?'Пока недостаточно данных':a.ordersRejected?'Снизьте отказы из-за нехватки продуктов':a.lossBatches?'Сократите потери по срокам':'Заказы выполняются без дефицита';
  const text=a.ordersRejected
    ? `${a.ordersRejected} из ${total} заказов отклонены (${rejectionRate.toLocaleString('ru-RU',{maximumFractionDigits:1})}%). ${shortages.length?`В первую очередь проверьте запас: ${shortages.slice(0,3).map(p=>p.name).join(', ')}.`:'Проверьте причины в журнале заказов.'}`
    : a.lossBatches?`Списано ${a.lossBatches} партий. ${losses.length?`Пересмотрите объём закупки и использование: ${losses.slice(0,3).map(p=>p.name).join(', ')}.`:'Проверьте сроки поставок.'}`
    : total?`Принято ${a.ordersAccepted} заказов, списаний по сроку за период нет. Сохраняйте текущий уровень запасов и контролируйте ближайшие сроки.`:'После первых заказов здесь появятся выводы о дефиците и потерях.';
  return {total,rejectionRate,shortages,losses,title,text,tone:a.ordersRejected?'red':a.lossBatches?'amber':total?'green':'neutral'};
}

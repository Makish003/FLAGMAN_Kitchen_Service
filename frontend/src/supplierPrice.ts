import {inputNumber,unitFactor} from './format';
import type {ProductOption} from './workflowTypes';

export function supplierPrice(product:ProductOption|undefined,unit=product?.unit??'g') {
 return {unitCost:product?.lastUnitCost!=null?inputNumber(product.lastUnitCost*unitFactor(unit)/unitFactor(product.unit)):'',currency:product?.lastCurrency??'RUB'};
}

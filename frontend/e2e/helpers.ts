import type {Locator} from '@playwright/test';
export async function chooseOption(scope:Locator,label:string,value:string) {
  await scope.getByRole('combobox',{name:label,exact:true}).click();
  await scope.getByRole('option').and(scope.locator(`[data-value="${value}"]`)).click();
}

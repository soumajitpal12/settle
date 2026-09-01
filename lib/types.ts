export type Group={id:string;name:string;created_by:string;join_code:string};
export type Member={id:string;group_id:string;user_id:string|null;display_name:string};
export type ExpenseShare={id?:string;expense_id?:string;member_id:string;amount:number};
export type Expense={id:string;group_id:string;description:string;total_amount:number;payer_id:string;expense_type:'personal'|'shared';category:string;payment_method:string;date:string;notes:string|null;expense_shares?:ExpenseShare[]};
export type Settlement={id:string;group_id:string;from_member_id:string;to_member_id:string;amount:number;payment_method:string;date:string;notes:string|null};

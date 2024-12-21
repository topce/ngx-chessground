type BreakCallback<
	T extends (...args: any) => any,
	P = Parameters<T>,
> = P extends [...infer Rest, infer _Last]
	? ((...args: Rest) => ReturnType<T>) | JavaScriptCallback<T, Rest>
	: T;

interface Array<T> {
	forEach(
		callbackfn: JavaScriptCallback<
			(value: T, index: number, array: T[]) => void
		>,
		thisArg?: any,
	): void;

	map<U>(
		callbackfn: JavaScriptCallback<(value: T, index: number, array: T[]) => U>,
		thisArg?: any,
	): U[];
}

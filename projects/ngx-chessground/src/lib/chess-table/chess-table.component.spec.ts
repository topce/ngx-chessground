import { type ComponentFixture, TestBed } from "@angular/core/testing";

import { ChessTableComponent } from "./chess-table.component";

describe("ChessTableComponent", () => {
	let component: ChessTableComponent;
	let fixture: ComponentFixture<ChessTableComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			imports: [ChessTableComponent],
		}).compileComponents();
	});

	beforeEach(() => {
		fixture = TestBed.createComponent(ChessTableComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it("should create", () => {
		expect(component).toBeTruthy();
	});
});

module suiadrop::suiadrop {
    use std::type_name::{get, TypeName};
    use std::vector;
    use sui::bag::{Self, Bag};
    use sui::coin::{Self, Coin};
    use sui::object::{Self, UID};
    use sui::table::{Self, Table};
    use sui::transfer::{share_object, public_transfer};
    use sui::tx_context::{TxContext, sender};

    // errors
    const ENOT_AUTHORIZED: u64 = 1;
    const ENOT_IN_WHITELIST: u64 = 2;
    const EALREADY_CLAIMED: u64 = 3;

    const SUIADROP_AMOUNT: u64 = 1_000_000_000;

    struct Global has key {
        id: UID,
        admin: address,
        treasure: Bag,
        whitelist: Table<address, bool>,  // the value is false by default, true means the address already claimed
    }

    fun init(ctx: &mut TxContext) {
        let global = Global {
            id: object::new(ctx),
            admin: sender(ctx),
            treasure: bag::new(ctx),
            whitelist: table::new(ctx),
        };
        share_object(global);
    }

    entry public fun add_whitelist(
        global: &mut Global,
        addresses: vector<address>,
        ctx: &mut TxContext,
    ) {
        let sender = sender(ctx);
        assert!(sender == global.admin, ENOT_AUTHORIZED);
        let len = vector::length(&addresses);
        let i = 0;
        while(i < len) {
            let address = vector::borrow(&addresses, i);
            table::add(&mut global.whitelist, *address, false);
            i = i + 1;
        }
    }

    entry public fun deposit<T>(
        global: &mut Global,
        coin: Coin<T>,
        _ctx: &mut TxContext,
    ) {
        let coin_type = get<T>();
        if (!bag::contains(&global.treasure, coin_type)) {
            bag::add<TypeName, Coin<T>>(&mut global.treasure, coin_type, coin);
        } else {
            let exist_coin = bag::borrow_mut<TypeName, Coin<T>>(&mut global.treasure, coin_type);
            coin::join(exist_coin, coin);
        }
    }

    entry public fun claim<T>(
        global: &mut Global,
        ctx: &mut TxContext,
    ) {
        let sender = sender(ctx);
        assert!(table::contains(&global.whitelist, sender), ENOT_IN_WHITELIST);
        let claimed = table::borrow_mut(&mut global.whitelist, sender);
        assert!(!*claimed, EALREADY_CLAIMED);
        *claimed = true;
        let coin_type = get<T>();
        let coin = bag::borrow_mut<TypeName, Coin<T>>(&mut global.treasure, coin_type);
        let airdrop_coin = coin::split(coin, SUIADROP_AMOUNT, ctx);
        public_transfer(airdrop_coin, sender);
    }

    // withdraw all left coins after the activity
    entry public fun withdraw<T>(
        global: &mut Global,
        ctx: &mut TxContext,
    ) {
        let sender = sender(ctx);
        assert!(sender == global.admin, ENOT_AUTHORIZED);
        let coin_type = get<T>();
        let coin = bag::remove<TypeName, Coin<T>>(&mut global.treasure, coin_type);
        public_transfer(coin, sender);
    }
}

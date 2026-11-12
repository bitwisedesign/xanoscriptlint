function "Inventory/rename_item" {
  input {
  }

  stack {
    db.get inventory_item {
      field_name = "id"
      field_value = $input.id
    } as $item

    db.transaction {
      stack {
        db.edit inventory_item {
          field_name = "id"
          field_value = $input.id
          data = {
            name: $input.name
          }
        } as $updated
      }
    }
  }

  response = $ok
}

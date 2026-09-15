function "example" {
  input {
  }

  stack {
    db.query item {
      mock = {
        "catalog lists open shelves": {id: 1}
        "inventory_restock_applies" : {id: 2}
      }
    }
  }

  response = $item

  test "catalog lists open shelves" {
    input = {id: 1}
  }

  test "inventory_restock_applies" {
    input = {id: 2}
  }
}

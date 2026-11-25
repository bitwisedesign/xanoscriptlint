table sample {
  schema {
    int id
    text account_code
  }

  index = [
    {type: "primary", field: [{name: "id"}]}
    {type: "btree|unique", field: [{name: "uuid", op: "asc"}]}
    {
      type : "btree|unique"
      field: [{name: "account_code", op: "asc"}]
    }
    {
      type : "btree"
      field: [
        {name: "created_at", op: "desc"}
        {name: "region_code", op: "asc"}
      ]
    }
  ]
}
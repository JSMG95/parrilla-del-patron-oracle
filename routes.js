'use strict';
var express = require('express');
var router = express.Router();
var _ = require('lodash');
const dbConfig = require('./dbconfig.js');
const oracledb = require('oracledb');
const get = 'SELECT * FROM PRODUCTOS';
// --- Para que regrese cada row como un objeto
oracledb.outFormat = oracledb.OBJECT;
oracledb.autoCommit = true;
oracledb.createPool({
  user          : dbConfig.user,
  password      : dbConfig.password,
  connectString : dbConfig.connectString
}, (err, pool) => {
  if (err) {
      return next(err);
  }
});

// -------------- PRODUCTOS ----------------------
// GET /api/productos
router.get("/productos", function(req, res, next){
  oracledb.getConnection()
  .then((connection) => {
    connection.execute('SELECT * FROM PRODUCTOS', {})
    .then((result) => {
      let obj = new Array;
      Object.keys(result.rows).forEach(key => {
        obj.push(_.mapKeys(result.rows[key], (value, key) => {
          if (key === 'ID') {
            return '_id';
          }
          return key.toLowerCase();
        }));
      });
      res.json(obj);
      doRelease(connection);
    })
    .catch((err) => {
      return next(err);
      doRelease(connection);
    })
  })
  .catch((err) => {
    return next(err);
  });
});

// POST /api/productos
router.post("/productos", function(req, res, next){
  const { descripcion, precio, clasificacion, existencia = 9999 } = req.body;
  if (descripcion && precio && clasificacion) {
    const productoData = [ descripcion, precio, clasificacion, existencia ];
    let query = "INSERT INTO PRODUCTOS (descripcion, precio, clasificacion, existencia) VALUES (:descripcion, :precio, :clasificacion, :existencia)";
    oracledb.getConnection((err, connection) => {
      if (err) return next(err);
      connection.execute(query, productoData, (err, result) => {
        if (err) {
          doRelease(connection);
          return next(err);
        }
        connection.execute(get, {}, (err, result) => {
          if (err) {
              doRelease(connection);
              return next(err);
          }
          let obj = new Array;
          Object.keys(result.rows).forEach(key => {
            obj.push(_.mapKeys(result.rows[key], (value, key) => {
              if (key === 'ID') {
                return '_id';
              }
              return key.toLowerCase();
            }));
          });
          res.json(obj);
          doRelease(connection);
        });
      });
    });
  }
});

// DELETE /api/productos/:id
router.delete("/productos", function(req, res, next){
  const { _id } = req.body;
  let query = 'DELETE FROM PRODUCTOS WHERE ID = :id';
  if (_id) {
    oracledb.getConnection((err, connection) => {
      if (err) return next(err);
      connection.execute(query, [_id], (err, result) => {
        if (err) {
          doRelease(connection);
          return next(err);
        }
        res.json({ message: result.rowsAffected + ' rows affected.'});
        doRelease(connection);
      });
    });
  }
});

// PUT /api/productos/:id
router.put("/productos", function(req, res, next){
  const { type } = req.body;
  const { _id } = req.body.item;
  switch (type) {
    case 'Delete':
    let query = 'UPDATE PRODUCTOS SET existencia=0 WHERE id=:id';
    oracledb.getConnection((err, connection) => {
      if (err) return next(err);
      connection.execute(query, [_id], (err, result) => {
        if (err) {
            doRelease(connection);
            return next(err);
        }
      connection.execute(get, {}, (err, result) => {
        if (err) {
          doRelease(connection);
          return next(err);
        }
        let obj = new Array;
        Object.keys(result.rows).forEach(key => {
            obj.push(_.mapKeys(result.rows[key], (value, key) => {
                if (key === 'ID') {
                    return '_id';
                }
                return key.toLowerCase();
            }));
        });
        res.json(obj);
        doRelease(connection);
        });
      });
    });
    break;
    case 'Update':
    const { descripcion, precio, clasificacion } = req.body.item;
    if (descripcion && precio && clasificacion) {
      const productoData = [ descripcion, precio, clasificacion, _id ];
      let query = 'UPDATE PRODUCTOS SET descripcion=:d, precio=:p, clasificacion=:c WHERE id=:id';
      oracledb.getConnection((err, connection) => {
        if (err) return next(err);
        connection.execute(query, productoData, (err, result) => {
          if (err) {
            doRelease(connection);
            return next(err);
          }
          connection.execute(get, {}, (err, result) => {
            if (err) {
              doRelease(connection);
              return next(err);
            }
            let obj = new Array;
            Object.keys(result.rows).forEach(key => {
                obj.push(_.mapKeys(result.rows[key], (value, key) => {
                    if (key === 'ID') {
                        return '_id';
                    }
                    return key.toLowerCase();
                }));
            });
            res.json(obj);
            doRelease(connection);
          });
        });
      });
    }
    break;
  }
});

// -------------- VENTAS ----------------------
// GET /api/ventas
router.get("/ventas", function(req, res, next) {
  const { startDate, endDate } = JSON.parse(req.query.dates);
  let resultado = [];
  let query = `SELECT v.*, c.ID_CONSUMO, c.ID_MESA, c.TIPO, d.ID_DETALLE_CONSUMO, d.ID_PRODUCTO,
                      p.DESCRIPCION, p.PRECIO, p.CLASIFICACION, d.CANTIDAD
              FROM VENTA v JOIN CONSUMO c ON (v.FECHA = c.FECHA)
              JOIN DETALLE_CONSUMO d ON (c.FECHA = d.FECHA AND c.ID_CONSUMO = d.ID_CONSUMO)
              JOIN PRODUCTOS p ON (d.ID_PRODUCTO = p.ID)
              WHERE v.FECHA BETWEEN TO_DATE(\'${startDate.slice(0, 10)}\', 'YYYY-MM-DD') 
              AND TO_DATE(\'${endDate.slice(0, 10)}\', 'YYYY-MM-DD')
              ORDER BY v.ID, v.FECHA, c.ID_CONSUMO`;
  oracledb.getConnection()
    .then((connection) => {
      return connection.execute(query, {})
      .then((result) => {
        result.rows.forEach((row, index, array) => {
          let resultObject = {};
          if (index > 0) {
              if (row.ID === array[index - 1].ID) {
                  return
              }
          }
          resultObject.importe = row.IMPORTE;
          resultObject.fecha = row.FECHA;
          resultObject._id = row.ID;
          let detalleArray = [];
          let dateFiltered = array.filter((row_2) => row_2.FECHA.getTime() === row.FECHA.getTime());
          dateFiltered.forEach((dateFilteredRow, index, dateFilteredArray) => {
              if (index > 0) {
                  if (dateFilteredRow.ID_CONSUMO === dateFilteredArray[index - 1].ID_CONSUMO) {
                      return
                  }
              }
              let detalleObject = {};
              detalleObject.mesa = [{ id: dateFilteredRow.ID_MESA, status: "", tipo: dateFilteredRow.TIPO }]
              let ventaArray = [];
              let mesasFiltered = dateFilteredArray.filter((row_3) => dateFilteredRow.ID_CONSUMO === row_3.ID_CONSUMO);
              mesasFiltered.forEach((mesasFilteredRow, index, mesasDateFilteredArray) => {
                  let ventaObject = {}
                  ventaObject.id = mesasFilteredRow.ID_DETALLE_CONSUMO;
                  ventaObject.idProducto = mesasFilteredRow.ID_PRODUCTO;
                  ventaObject.descripcion = mesasFilteredRow.DESCRIPCION;
                  ventaObject.precio = mesasFilteredRow.PRECIO;
                  ventaObject.clasificacion = mesasFilteredRow.CLASIFICACION
                  ventaObject.cantidad = mesasFilteredRow.CANTIDAD
                  ventaArray.push(ventaObject);
              })
              detalleObject.venta = ventaArray;
              detalleArray.push(detalleObject);
          })
          resultObject.detalle = detalleArray;
          resultado.push(resultObject);
        });
        res.json(resultado);
        doRelease(connection);
      })
      .catch((err) => {
        doRelease(connection);
        return next(err);
      })
    })
    .catch((err) => {
      return next(err);
    });
});

// POST /api/ventas
router.post("/ventas", function(req, res, next){
  const { fecha, detalle } = req.body;
  if (fecha && detalle) {
    let insertConsumo = `INSERT INTO CONSUMO VALUES (to_date(:a,\'YYYY-MM-DD\'), :b, :c, :d)`
    let insertDetalles = "INSERT INTO DETALLE_CONSUMO VALUES (to_date(:a,\'YYYY-MM-DD\'), :b, :c, :d, :e)";
    var binds = [];
    var binds2 = [];
    var options = {
      autoCommit: true,
      bindDefs: {
        a: { type: oracledb.STRING, maxSize: 20 },
        b: { type: oracledb.NUMBER },
        c: { type: oracledb.NUMBER },
        d: { type: oracledb.STRING, maxSize: 50 }
      }
    };
    var options2 = {
      autoCommit: true,
      bindDefs: {
        a: { type: oracledb.STRING, maxSize: 20 },
        b: { type: oracledb.NUMBER },
        c: { type: oracledb.NUMBER },
        d: { type: oracledb.NUMBER },
        e: { type: oracledb.NUMBER }
      }
    };
    detalle.forEach((row, index, array) => {
      let obj = {};
      obj.a = fecha.slice(0, 10);
      obj.b = index + 1;
      obj.c = row.mesa[0].id;
      obj.d = row.mesa[0].tipo;
      binds.push(obj);
      row.venta.forEach((row2, index2, array2) => {
        let obj2 = {};
        obj2.a = fecha.slice(0, 10);
        obj2.b = index + 1;
        obj2.c = row2.id;
        obj2.d = row2.idProducto;
        obj2.e = row2.cantidad;
        binds2.push(obj2);
      });
    });
    oracledb.getConnection()
    .then((connection) => {
      return connection.executeMany(insertConsumo, binds, options)
      .then((results) => {
        console.log('Affected rows:', results.rowsAffected, ' in CONSUMO');
        return connection.executeMany(insertDetalles, binds2, options2)
        .then((results2) => {
          console.log('Affected rows:', results2.rowsAffected, ' in DETALLE_CONSUMO');
          return connection.execute(`BEGIN closeventa(to_date(\'${fecha.slice(0,10)}\',\'YYYY-MM-DD\')); END;`, {})
          .then((results3) => {
            console.log('Stored procedure executed correctly.');
            res.json('Stored procedure executed correctly.');
            doRelease(connection);
          })
          .catch((err) => {
            doRelease(connection);
            return next(err);
          })
        })
        .catch((err) => {
          doRelease(connection);
          return next(err);
        })
      })
      .catch((err) => {
        doRelease(connection);
        return next(err);
      });
    })
    .catch((err) => {
      return next(err);
    });
  }
});

// GET /api/report
router.get("/report/mes", function(req, res, next) {
  let report_mes_sp = `BEGIN reporte_mes(:mes, :yr, :resultado); END;`;
  let binds = { 
    mes: { dir:oracledb.BIND_IN, val: req.query.month ,type: oracledb.STRING, maxSize: 2 },
    yr: { dir:oracledb.BIND_IN, val: req.query.year ,type: oracledb.STRING, maxSize: 4 },
    resultado: { dir:oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 32767 }
  };
  let options = { outFormat: oracledb.ARRAY };
  oracledb.getConnection()
    .then((connection) => {
      return connection.execute(report_mes_sp, binds, options)
      .then((result) => {
        let x = result.outBinds.resultado.replace(/,}/gm, '}');
        res.end(x);
        doRelease(connection);
      })
      .catch((err) => {
        doRelease(connection);
        return next(err);
      });
    })
    .catch((err) => {
      return next(err);
    });
});

router.get("/report/year", function(req, res, next) {
  let report_anual_sp = `BEGIN reporte_anual(:yr, :resultado); END;`;
  let binds = {
    yr: { dir:oracledb.BIND_IN, val: req.query.year ,type: oracledb.STRING, maxSize: 4 },
    resultado: { dir:oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 32767 }
  };
  let options = { outFormat: oracledb.ARRAY };
  oracledb.getConnection()
    .then((connection) => {
      return connection.execute(report_anual_sp, binds, options)
      .then((result) => {
        let x = result.outBinds.resultado.replace(/,}/gm, '}').replace(/,]/gm,']');
        res.end(x);
        doRelease(connection);
      })
      .catch((err) => {
        doRelease(connection);
        return next(err);
      });
    })
    .catch((err) => {
      return next(err);
    });
});

function doRelease(connection) {
    connection.close((err) => {
        if (err) {
          console.error(err);
        }
    });
}

module.exports = router;